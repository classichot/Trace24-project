import 'server-only';

import { listClaims, listEvidence } from './evidence';
import {
  SCORE_DISCLAIMER,
  buildAnalyticalConclusions,
  buildFactRecords,
  detectMissingInformation,
} from './facts';
import { buildTemporalGraph } from './graph';
import { hybridGraphRag } from './rag';
import { resolveEntities } from './resolve';
import { buildAlerts, scoreRisks } from './risk';
import { buildVectorIndex } from './vector';
import type {
  CaseBrief,
  EvidenceMapItem,
  InvestigationLead,
  InvestigationPack,
  PipelineLayerStatus,
  PipelineReportLike,
} from './types';

function layers(): { layer: string; status: PipelineLayerStatus; note: string }[] {
  return [
    { layer: 'Evidence layer', status: 'live', note: 'Immutable checksum store · claims with provenance' },
    { layer: 'Intelligence layer', status: 'live', note: 'Temporal knowledge graph (dated edges)' },
    { layer: 'Detection layer', status: 'live', note: 'Rules + missing-info + statistical signals' },
    { layer: 'Explanation layer', status: 'live', note: 'Hybrid Graph RAG · facts vs inferences' },
    { layer: 'Public Data Sources', status: 'live', note: 'Municipal + e-GP + data.go.th / ภาษีไปไหน' },
    { layer: 'Source Registry + Ingestion', status: 'live', note: 'Registry + fetch / govspending builders' },
    { layer: 'OCR + Document Extraction', status: 'live', note: 'HTML/PDF extract + OCR hook' },
    { layer: 'Validation + Normalisation', status: 'live', note: 'Thai digits, baht, titles, methods' },
    { layer: 'Structured Database', status: 'live', note: 'JSON reports in data/real' },
    { layer: 'Vector Index', status: 'live', note: 'Local TF-IDF passages in data/vector' },
    { layer: 'Entity Resolution', status: 'live', note: 'Alias clustering' },
    { layer: 'Alert System', status: 'live', note: 'High-severity signals with innocent alternatives' },
    { layer: 'Investigation Assistant', status: 'live', note: 'Brief / leads / Rule Proposer' },
  ];
}

function buildEvidenceMap(agencyId: string, report: PipelineReportLike): EvidenceMapItem[] {
  const items: EvidenceMapItem[] = [];
  const stored = listEvidence(agencyId);
  for (const ev of stored.slice(0, 30)) {
    items.push({
      id: ev.id,
      label: ev.labels.join(', ') || ev.sourceUrl,
      kind: 'immutable_evidence',
      when: ev.fetchedAt,
      url: ev.sourceUrl,
      relatedEntityIds: [`agency:${agencyId}`],
      evidenceId: ev.id,
      checksumSha256: ev.checksumSha256,
      extractionMethod: ev.extractionMethod || null,
      confidence: ev.confidence ?? null,
      locator: null,
    });
  }

  for (const [pid, pr] of Object.entries(report.projects || {})) {
    for (const [ti, row] of (pr.timeline || []).entries()) {
      items.push({
        id: `em-${pid}-${ti}`,
        label: row[1],
        kind: /ผู้ชนะ|คัดเลือก/.test(row[1]) ? 'winner_announce' : 'announce',
        when: row[0],
        url: row[2] && row[2] !== 'e-GP' ? row[2] : pr._sourceUrl || null,
        relatedEntityIds: [`project:${pid}`, pr.winner ? `company:${pr.winner}` : ''].filter(Boolean),
        evidenceId: null,
        checksumSha256: null,
        extractionMethod: 'html-timeline',
        confidence: 0.75,
        locator: { section: row[1] },
      });
    }
  }
  const priority = new Set(report.priorityOrder || []);
  return items
    .sort((a, b) => {
      const ap = a.kind === 'immutable_evidence' ? 2 : a.relatedEntityIds.some((id) => priority.has(id.replace('project:', ''))) ? 1 : 0;
      const bp = b.kind === 'immutable_evidence' ? 2 : b.relatedEntityIds.some((id) => priority.has(id.replace('project:', ''))) ? 1 : 0;
      return bp - ap;
    })
    .slice(0, 50);
}

function buildCaseBrief(
  report: PipelineReportLike,
  riskOverall: number,
  factCount: number,
  gapCount: number
): CaseBrief {
  const cf = report.caseFile;
  const top = (report.topContractors || []).slice(0, 3);
  const high = Object.values(report.projects || {}).filter((p) => p.sevKey === 'High').length;
  const withPrice = Object.values(report.projects || {}).filter((p) => p.award && p.award !== '—').length;
  const keyFindings = [
    `ข้อเท็จจริงที่บันทึกได้ ${factCount} รายการ · ช่องว่างข้อมูลที่วัดได้ ${gapCount} รายการ`,
    `คะแนนจัดลำดับการตรวจ ${Math.round(riskOverall * 100)}/100 (ไม่ใช่คะแนนข้อกล่าวหา)`,
    `โครงการสัญญาณสูงในรายงาน ${high} · มีราคา ${withPrice} รายการ`,
    ...top.map((t) => `ผู้รับจ้างเด่น: ${t.name} · ${t.n} สัญญา · ${t.value}`),
  ];
  return {
    title: cf?.title || `การวิเคราะห์จัดซื้อจัดจ้าง — ${report.agency?.th || ''}`,
    summary: cf?.summary || String(report.meta?.scanSummary || ''),
    riskExplanation:
      cf?.signals ||
      `แยก 3 ชั้น: ข้อเท็จจริง (fact) → สัญญาณความเสี่ยง (signal) → ข้อสรุปเชิงวิเคราะห์ที่ต้องสอบสวนต่อ (conclusion) — ${SCORE_DISCLAIMER}`,
    sourceCitations: [
      ...(report.sources || []).map((s) => s.url),
      ...(cf?.evidence || []).slice(0, 8),
    ].filter(Boolean),
    keyFindings,
    scoreDisclaimer: SCORE_DISCLAIMER,
  };
}

function buildLeads(
  report: PipelineReportLike,
  gaps: ReturnType<typeof detectMissingInformation>['gaps']
): InvestigationLead[] {
  const leads: InvestigationLead[] = [];

  for (const g of gaps.slice(0, 4)) {
    leads.push({
      id: `lead-${g.id}`,
      question: `ทำไม「${g.expected}」จึงยังไม่ครบ?`,
      why: `${g.observed} (gapScore ${g.gapScore})`,
      missingDocuments: [g.expected],
      nextActions: ['ดึงประกาศ/สัญญาเพิ่ม', 'บันทึก evidence checksum', 'ถาม Hybrid Graph RAG'],
      priority: g.gapScore >= 0.5 ? 'High' : 'Medium',
    });
  }

  for (const q of report.caseFile?.questions || []) {
    leads.push({
      id: `lead-q-${leads.length}`,
      question: q[0],
      why: `สถานะในสำนวน: ${q[1]}`,
      missingDocuments: ['เอกสารชี้แจงจากหน่วยงาน', 'หลักฐานประกอบเพิ่มเติม'],
      nextActions: ['ส่งหนังสือขอข้อมูล', 'ถาม Hybrid Graph RAG ด้วยชื่อโครงการ'],
      priority: 'Medium',
    });
  }

  const highProjects = Object.entries(report.projects || {})
    .filter(([, p]) => p.sevKey === 'High')
    .slice(0, 5);
  for (const [pid, pr] of highProjects) {
    leads.push({
      id: `lead-proj-${pid}`,
      question: `ทำไมโครงการ ${pr.code} จึงถูกจัดลำดับความเสี่ยงสูง?`,
      why: pr.alerts?.[0]?.title || 'มีสัญญาณระดับสูง — ต้องแยกข้อเท็จจริงจากข้อสรุป',
      missingDocuments: ['TOR', 'ราคากลาง', 'รายชื่อผู้เสนอราคา', 'เอกสารตรวจรับ'],
      nextActions: [
        'เปิด Hybrid Graph RAG ด้วยชื่อโครงการ',
        'ไล่ timeline เอกสารพร้อม checksum',
        'ตรวจกรรมการ/ที่อยู่ร่วมเมื่อมี DBD',
      ],
      priority: 'High',
    });
  }

  leads.push({
    id: 'lead-dbd',
    question: 'ผู้ชนะมีความเชื่อมโยงกรรมการ/ที่อยู่ร่วมกันหรือไม่?',
    why: 'Entity resolution ชื่อซ้ำทำงานแล้ว — ยังขาดข้อมูลกรรมการจาก DBD (ความสัมพันธ์ต้องมีช่วงเวลา)',
    missingDocuments: ['บอจ.5', 'ข้อมูลกรรมการ DBD', 'ที่อยู่จดทะเบียน'],
    nextActions: ['เชื่อมแหล่ง DBD', 'ใส่ since/until บน edges', 'ตรวจคลัสเตอร์ในแท็บผู้ช่วยสอบสวน'],
    priority: 'Medium',
  });

  const related = (report as { relatedParty?: { matches?: { ruleId: string; explanation: string; matchType: string }[] } })
    .relatedParty?.matches || [];
  for (const m of related.slice(0, 6)) {
    leads.push({
      id: `lead-rel-${leads.length}`,
      question:
        m.ruleId === 'R13'
          ? 'ผู้บริหารหน่วยงานเกี่ยวข้องกับกรรมการ/ผู้ถือหุ้นผู้ชนะหรือไม่?'
          : 'ผู้รับจ้างมีกรรมการหรือที่อยู่ร่วมกันหรือไม่?',
      why: `${m.explanation} (${m.matchType})`,
      missingDocuments: ['ทำเนียบผู้บริหาร', 'บอจ.5 / ข้อมูลกรรมการ DBD', 'คำสั่งแต่งตั้ง'],
      nextActions: [
        'เปิดแท็บความเชื่อมโยงเพื่อตรวจรายละเอียด',
        'ยืนยันด้วยเอกสารต้นทาง — อย่าสรุปจากนามสกุลอย่างเดียว',
      ],
      priority: m.ruleId === 'R13' && m.matchType === 'surname' ? 'Medium' : 'High',
    });
  }

  if (!related.length) {
    leads.push({
      id: 'lead-r13-setup',
      question: 'ควรใส่ทำเนียบผู้บริหารและกรรมการผู้ชนะเพื่อเปิดการตรวจ R13 หรือไม่?',
      why: 'กฎ R13 ต้องการข้อมูลทั้งสองฝั่ง — ปัจจุบันอาจยังว่าง',
      missingDocuments: ['ทำเนียบผู้บริหารจากเว็บหน่วยงาน', 'กรรมการ/ผู้ถือหุ้นจาก data.dbd.go.th'],
      nextActions: ['เปิดแท็บความเชื่อมโยง', 'บันทึกข้อมูลแล้วสแกนหน่วยงานใหม่'],
      priority: 'Medium',
    });
  }

  return leads.slice(0, 14);
}

export function hybridGraphRetrieve(report: PipelineReportLike, query: string) {
  const agencyId = report.agency?.id || 'agency';
  return hybridGraphRag(agencyId, report, query);
}

export function buildInvestigationPack(
  agencyId: string,
  report: PipelineReportLike
): InvestigationPack {
  const risk = scoreRisks(report);
  const vector = buildVectorIndex(agencyId, report);
  const entityClusters = resolveEntities(report);
  const claims = listClaims(agencyId);
  const facts = buildFactRecords(report, claims);
  const { gaps } = detectMissingInformation(report);
  const conclusions = buildAnalyticalConclusions(facts, risk.signals, gaps);

  return {
    agencyId,
    generatedAt: new Date().toISOString(),
    pipeline: layers(),
    architecture: {
      evidenceLayer: 'Immutable raw document store (checksum + provenance + claims)',
      intelligenceLayer: 'Temporal knowledge graph (dated relationships)',
      detectionLayer: 'Rules, missing-info gaps, statistical signals',
      explanationLayer: 'Hybrid Graph RAG (facts vs inferences + next steps)',
      principle:
        'The knowledge graph is the intelligence layer; the raw document store is the evidence layer; analytical engines are the detection layer; Hybrid Graph RAG is the explanation layer. Scores prioritize review — they never prove misconduct.',
    },
    evidenceMap: buildEvidenceMap(agencyId, report),
    claims,
    facts,
    missingInfo: gaps,
    conclusions,
    caseBrief: buildCaseBrief(report, risk.overall, facts.length, gaps.length),
    leads: buildLeads(report, gaps),
    risk,
    alerts: buildAlerts(risk),
    graph: buildTemporalGraph(report),
    entityClusters,
    vector: { passages: vector.nDocs, builtAt: vector.builtAt },
    extraction: {
      status: 'live',
      methods: ['html', 'pdf-text', 'pdf-stream', 'ocr-stub'],
      note: 'Original bytes stored when extract API runs with store=true; claims carry locator + checksum',
    },
  };
}
