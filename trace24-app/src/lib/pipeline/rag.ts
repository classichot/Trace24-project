import 'server-only';

import { buildTemporalGraph, traverseGraphNeighbourhood } from './graph';
import { scoreRisks } from './risk';
import { searchVectorIndex, ensureVectorIndex, type VectorHit } from './vector';
import type { HybridRagResult, NormalizedEntity, PipelineReportLike, RagCitation, RiskSignal } from './types';

export type { HybridRagResult, RagCitation };

function seedNodesFromQuery(report: PipelineReportLike, query: string): string[] {
  const graph = buildTemporalGraph(report);
  const q = query.toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  const seeds = graph.nodes
    .filter((n) => {
      const blob = `${n.label} ${Object.values(n.attrs).join(' ')}`.toLowerCase();
      return tokens.some((tok) => blob.includes(tok)) || blob.includes(q);
    })
    .map((n) => n.id);
  if (seeds.length) return seeds.slice(0, 8);
  // fallback: high-severity projects
  return Object.entries(report.projects || {})
    .filter(([, p]) => p.sevKey === 'High')
    .slice(0, 5)
    .map(([id]) => `project:${id}`);
}

function matchingSignals(report: PipelineReportLike, query: string, nodes: NormalizedEntity[]): RiskSignal[] {
  const risk = scoreRisks(report);
  const q = query.toLowerCase();
  const nodeIds = new Set(nodes.map((n) => n.id));
  return risk.signals
    .filter((s) => {
      const hay = `${s.title} ${s.explanation} ${s.category}`.toLowerCase();
      return (
        s.subjectIds.some((id) => nodeIds.has(id)) ||
        q.split(/\s+/).some((tok) => tok.length > 2 && hay.includes(tok)) ||
        s.kind === 'missing_information'
      );
    })
    .slice(0, 8);
}

function riskLevelFromScore(overall: number): HybridRagResult['assessment']['riskLevel'] {
  if (overall >= 0.7) return 'High';
  if (overall >= 0.4) return 'Medium';
  if (overall > 0) return 'Low';
  return 'Unknown';
}

function buildStructuredAnswer(input: {
  query: string;
  nodes: NormalizedEntity[];
  citations: RagCitation[];
  facts: string[];
  inferences: string[];
  ruleHits: HybridRagResult['ruleHits'];
  nextSteps: string[];
  assessment: HybridRagResult['assessment'];
}): string {
  const lines: string[] = [];
  const scoreLabel =
    input.assessment.score100 != null
      ? `${input.assessment.riskLevel} — ${input.assessment.score100}/100`
      : input.assessment.riskLevel;
  lines.push(`ระดับความเสี่ยง (จัดลำดับการตรวจ): ${scoreLabel}`);
  lines.push('');
  lines.push('ข้อเท็จจริงที่ยืนยันได้จากเอกสาร/ชุดข้อมูล:');
  if (input.facts.length) {
    input.facts.slice(0, 6).forEach((f, i) => lines.push(`${i + 1}. ${f}`));
  } else {
    lines.push('— ยังสรุปข้อเท็จจริงจากดัชนีไม่พอ');
  }
  lines.push('');
  lines.push('สัญญาณวิเคราะห์ (ไม่ใช่ข้อพิสูจน์):');
  if (input.inferences.length) {
    input.inferences.slice(0, 6).forEach((f, i) => lines.push(`${i + 1}. ${f}`));
  } else {
    lines.push('— ไม่มีสัญญาณที่จับคู่คำถามนี้ชัดเจน');
  }
  lines.push('');
  lines.push('การประเมิน:');
  lines.push(input.assessment.caveat);
  lines.push('');
  lines.push('ขั้นตอนถัดไปที่แนะนำ:');
  input.nextSteps.forEach((s) => lines.push(`- ${s}`));
  if (input.nodes.length) {
    lines.push('');
    lines.push(
      `โหนดกราฟที่ใช้: ${input.nodes
        .slice(0, 6)
        .map((n) => `${n.type}:${n.label}`)
        .join(' · ')}`
    );
  }
  if (input.citations.length) {
    lines.push(`อ้างอิงหลักฐาน ${input.citations.length} ชิ้น (ดู citations)`);
  }
  return lines.join('\n');
}

/**
 * Hybrid Graph RAG:
 * graph neighbourhood (temporal) + vector passages + triggered rules
 * → explanation that separates facts vs inferences + next steps.
 */
export function hybridGraphRag(
  agencyId: string,
  report: PipelineReportLike,
  query: string,
  opts: { rebuildIndex?: boolean; limit?: number } = {}
): HybridRagResult {
  ensureVectorIndex(agencyId, report);

  const fullGraph = buildTemporalGraph(report);
  const seeds = seedNodesFromQuery(report, query);
  const { nodes, edges } = traverseGraphNeighbourhood(fullGraph, seeds, 2);
  const signals = matchingSignals(report, query, nodes);
  const risk = scoreRisks(report);

  const vectorHits: VectorHit[] = searchVectorIndex(agencyId, query, {
    limit: opts.limit ?? 10,
    report,
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const citations: RagCitation[] = vectorHits
    .map((h) => ({
      id: h.id,
      kind: h.kind,
      text: h.text,
      url: h.sourceUrl,
      score: h.score * (h.entityIds.some((id) => nodeIds.has(id)) ? 1.25 : 1),
      entityIds: h.entityIds,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 8);

  const facts: string[] = [];
  for (const n of nodes.slice(0, 8)) {
    if (n.type === 'project') {
      facts.push(
        `โครงการ「${n.label}」รหัส ${n.attrs.code || '—'} · วิธี ${n.attrs.method || '—'} · ราคา ${n.attrs.award || '—'} · ประกาศ ${n.attrs.announced || '—'}`
      );
    }
    if (n.type === 'company') {
      facts.push(`นิติบุคคล「${n.label}」· สัญญาที่บันทึก ${n.attrs.contracts ?? '—'} · รวม ${n.attrs.total || '—'}`);
    }
    if (n.type === 'document') {
      facts.push(`เอกสาร「${n.label}」วันที่ ${n.attrs.when || '—'} · ${n.attrs.url || ''}`);
    }
  }
  const labelById = new Map(nodes.map((n) => [n.id, n.label]));
  for (const e of edges.filter((x) => x.since).slice(0, 5)) {
    const fromLabel = labelById.get(e.from) || e.from;
    const toLabel = labelById.get(e.to) || e.to;
    facts.push(
      `ความสัมพันธ์「${e.rel}」${fromLabel} → ${toLabel} ตั้งแต่ ${e.since}${e.until ? ` ถึง ${e.until}` : ''}`
    );
  }
  for (const c of citations.filter((x) => x.kind !== 'risk_alert').slice(0, 4)) {
    facts.push(`ข้อความจากหลักฐาน: ${c.text.slice(0, 140)}`);
  }

  const inferences = signals.map(
    (s) =>
      `${s.title} (${s.severity}, ${(s.score * 100).toFixed(0)}/100) — ${s.explanation} [ทางเลือกที่ชอบด้วยกฎหมาย: ${s.innocentExplanation}]`
  );

  const ruleHits = signals.map((s) => ({
    id: s.id,
    title: s.title,
    severity: s.severity,
    score: Number((s.score * 100).toFixed(0)),
  }));

  const missing = signals.filter((s) => s.kind === 'missing_information');
  const nextSteps = [
    ...new Set([
      ...missing.slice(0, 2).map((s) => `ติดตามช่องว่าง: ${s.title}`),
      'ตรวจ beneficial ownership / กรรมการร่วม หากมีแหล่ง DBD',
      'ขอเอกสาร TOR · ราคากลาง · รายชื่อผู้เสนอราคา ที่ยังไม่พบ',
      'เทียบ timeline การยื่นซองหากเข้าถึงได้โดยชอบด้วยกฎหมาย',
      'ตรวจเอกสารส่งมอบและตรวจรับของโครงการสัญญาณสูง',
    ]),
  ].slice(0, 6);

  const assessment: HybridRagResult['assessment'] = {
    riskLevel: riskLevelFromScore(risk.overall),
    score100: Math.round(risk.overall * 100),
    caveat:
      'รูปแบบเหล่านี้อาจบ่งชี้ความเสี่ยงที่ควรสอบสวน — ไม่ได้พิสูจน์การทุจริตโดยลำพัง คะแนนใช้จัดลำดับความสำคัญเท่านั้น',
  };

  const answer = buildStructuredAnswer({
    query,
    nodes,
    citations,
    facts,
    inferences,
    ruleHits,
    nextSteps,
    assessment,
  });

  return {
    query,
    answeredAt: new Date().toISOString(),
    answer,
    extractiveAnswer: answer,
    graphNodes: nodes,
    graphEdges: edges.map((e) => ({
      from: e.from,
      to: e.to,
      rel: e.rel,
      since: e.since,
      until: e.until,
    })),
    citations,
    mode: 'hybrid-graph-vector',
    facts,
    inferences,
    ruleHits,
    nextSteps,
    assessment,
  };
}
