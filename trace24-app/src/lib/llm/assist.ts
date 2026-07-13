import { chatCompletion, parseJsonLoose } from './client';
import type { HybridRagResult } from '@/lib/pipeline/rag';
import type { InvestigationPack, PipelineReportLike, RiskSignal } from '@/lib/pipeline/types';

const GUARDRAILS = `You assist TRACE24, a Thai municipal procurement integrity tool.
Rules:
- Never invent URLs, contract IDs, winners, or amounts not present in the provided evidence.
- Risk scores and red-flag severity must remain driven by deterministic rules — you may explain, prioritize questions, and propose rule drafts only.
- Write in Thai unless the user asks otherwise.
- Distinguish: สัญญาณที่อธิบายได้ vs ข้อกล่าวหา — never claim proven corruption.
- Prefer actionable investigation steps and missing documents.`;

export type LlmRagAssist = {
  answer: string;
  model: string;
  mode: 'hybrid-graph-vector+llm';
};

export async function synthesizeRagWithLlm(rag: HybridRagResult): Promise<LlmRagAssist | { error: string }> {
  const evidence = rag.citations
    .slice(0, 8)
    .map(
      (c, i) =>
        `[${i + 1}] kind=${c.kind} score=${c.score.toFixed(2)} url=${c.url || '—'}\n${c.text.slice(0, 400)}`
    )
    .join('\n\n');
  const nodes = rag.graphNodes
    .slice(0, 8)
    .map((n) => `${n.type}:${n.label}`)
    .join(' · ');

  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `สังเคราะห์คำตอบจากหลักฐานเท่านั้น — แยกข้อเท็จจริง / สัญญาณ / ข้อสรุปเชิงวิเคราะห์
คำถาม: ${rag.query}
ระดับจัดลำดับ: ${rag.assessment.riskLevel} (${rag.assessment.score100 ?? '—'}/100)
โหนดกราฟ: ${nodes || '—'}
ข้อเท็จจริงที่มี: ${rag.facts.slice(0, 6).join(' | ') || '—'}
สัญญาณที่มี: ${rag.inferences.slice(0, 6).join(' | ') || '—'}
กฎที่ถูกกระตุ้น: ${rag.ruleHits.map((r) => r.title).join(' · ') || '—'}
หลักฐาน:
${evidence || '(ไม่มี)'}

รูปแบบตอบ (ไทย):
1) ข้อเท็จจริงที่ยืนยันได้ (bullet)
2) สัญญาณวิเคราะห์ — ระบุชัดว่าไม่ใช่ข้อพิสูจน์
3) การประเมินสั้น ๆ + ข้อแม้
4) ขั้นตอนถัดไป 3-5 ข้อ
ห้ามกล่าวหาว่าทุจริต`,
      },
    ],
    { temperature: 0.15, maxTokens: 1100 }
  );

  if (!result.ok) return { error: result.error };
  return { answer: result.content, model: result.model, mode: 'hybrid-graph-vector+llm' };
}

export type SignalReview = {
  model: string;
  reviews: {
    signalId: string;
    likelyFalsePositive: boolean;
    priorityBoost: 'up' | 'down' | 'same';
    rationale: string;
    followUpQuestion: string;
  }[];
  summary: string;
};

export async function reviewSignalsWithLlm(
  pack: InvestigationPack
): Promise<SignalReview | { error: string }> {
  const signals = pack.risk.signals.slice(0, 12).map((s: RiskSignal) => ({
    id: s.id,
    ruleId: s.ruleId,
    title: s.title,
    severity: s.severity,
    score: s.score,
    explanation: s.explanation,
    innocent: s.innocentExplanation,
  }));

  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `หน่วยงาน: ${pack.agencyId}
สำนวนสั้น: ${pack.caseBrief.summary.slice(0, 500)}
สัญญาณจากกฎ (อย่าเปลี่ยน severity เอง — แค่ประเมินความน่าจะเป็น false positive และคำถามติดตาม):
${JSON.stringify(signals, null, 2)}

ตอบเป็น JSON เท่านั้น:
{
  "summary": "สรุป 2-3 ประโยค",
  "reviews": [
    {
      "signalId": "...",
      "likelyFalsePositive": false,
      "priorityBoost": "up|down|same",
      "rationale": "...",
      "followUpQuestion": "..."
    }
  ]
}`,
      },
    ],
    { temperature: 0.1, maxTokens: 1600, json: true }
  );

  if (!result.ok) return { error: result.error };
  const parsed = parseJsonLoose<{
    summary?: string;
    reviews?: SignalReview['reviews'];
  }>(result.content);
  if (!parsed?.reviews) return { error: 'LLM returned invalid JSON for signal review' };

  return {
    model: result.model,
    summary: parsed.summary || '',
    reviews: parsed.reviews,
  };
}

export type RuleProposal = {
  model: string;
  proposals: {
    suggestedRuleId: string;
    title: string;
    category: string;
    rationale: string;
    featureHints: string[];
    thresholdSketch: string;
    needsHumanApproval: true;
  }[];
  notes: string;
};

export async function proposeRulesWithLlm(
  pack: InvestigationPack
): Promise<RuleProposal | { error: string }> {
  const payload = {
    agencyId: pack.agencyId,
    riskOverall: pack.risk.overall,
    topSignals: pack.risk.signals.slice(0, 10).map((s) => ({
      ruleId: s.ruleId,
      title: s.title,
      severity: s.severity,
      explanation: s.explanation,
    })),
    leads: pack.leads.slice(0, 6),
    topContractors: pack.entityClusters.slice(0, 8).map((c) => ({
      canonical: c.canonical,
      type: c.type,
      aliases: c.aliases.slice(0, 4),
    })),
  };

  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `จากสัญญาณและ leads ด้านล่าง เสนอกฎ Red Flag ใหม่ 2-4 ข้อ ที่วัดได้จากข้อมูลจัดซื้อจัดจ้าง (ราคา, วิธี, ผู้ชนะ, timeline)
กฎต้องเป็น draft เท่านั้น — needsHumanApproval ต้องเป็น true เสมอ
อย่าเสนอกฎที่อิงแต่ความรู้สึกจากข้อความ

ข้อมูล:
${JSON.stringify(payload, null, 2)}

JSON:
{
  "notes": "...",
  "proposals": [
    {
      "suggestedRuleId": "R12",
      "title": "...",
      "category": "...",
      "rationale": "...",
      "featureHints": ["..."],
      "thresholdSketch": "...",
      "needsHumanApproval": true
    }
  ]
}`,
      },
    ],
    { temperature: 0.25, maxTokens: 1600, json: true }
  );

  if (!result.ok) return { error: result.error };
  const parsed = parseJsonLoose<{ notes?: string; proposals?: RuleProposal['proposals'] }>(result.content);
  if (!parsed?.proposals?.length) return { error: 'LLM returned invalid JSON for rule proposals' };

  return {
    model: result.model,
    notes: parsed.notes || '',
    proposals: parsed.proposals.map((p) => ({ ...p, needsHumanApproval: true as const })),
  };
}

export type BriefAssist = {
  model: string;
  refinedSummary: string;
  prioritizedLeads: string[];
  accuracyNotes: string[];
};

export async function refineBriefWithLlm(
  pack: InvestigationPack,
  report: PipelineReportLike
): Promise<BriefAssist | { error: string }> {
  const stats = {
    agency: report.agency?.th,
    projects: Object.keys(report.projects || {}).length,
    contractors: Object.keys(report.contractors || {}).length,
    sources: (report.sources || []).map((s) => s.type),
    overall: pack.risk.overall,
    findings: pack.caseBrief.keyFindings,
    leads: pack.leads.map((l) => l.question),
  };

  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `ปรับสำนวนสอบสวนให้กระชับและใช้สอบสวนได้จริง จากสถิตินี้เท่านั้น:
${JSON.stringify(stats, null, 2)}

JSON:
{
  "refinedSummary": "ย่อหน้าเดียว",
  "prioritizedLeads": ["คำถามเรียงตามความสำคัญ 3-5 ข้อ"],
  "accuracyNotes": ["จุดที่ข้อมูลอาจไม่ครบ / false positive ที่ควรระวัง"]
}`,
      },
    ],
    { temperature: 0.2, maxTokens: 1000, json: true }
  );

  if (!result.ok) return { error: result.error };
  const parsed = parseJsonLoose<Omit<BriefAssist, 'model'>>(result.content);
  if (!parsed?.refinedSummary) return { error: 'LLM returned invalid JSON for brief' };

  return {
    model: result.model,
    refinedSummary: parsed.refinedSummary,
    prioritizedLeads: parsed.prioritizedLeads || [],
    accuracyNotes: parsed.accuracyNotes || [],
  };
}
