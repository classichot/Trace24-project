/**
 * User-facing LLM assists — explain, summarize, draft, narrate.
 * Never sets risk scores. Never invents amounts / winners / URLs.
 */

import { chatCompletion, parseJsonLoose } from './client';
import type { InvestigationPack, PipelineReportLike } from '@/lib/pipeline/types';

const GUARDRAILS = `You assist TRACE24, a Thai municipal procurement integrity tool.
Rules:
- Never invent URLs, contract IDs, winners, amounts, or document quotes not in the evidence.
- Risk scores stay from deterministic rules — you only explain, prioritize, and draft.
- Write in Thai unless asked otherwise.
- Distinguish สัญญาณ / lead / presumption from ข้อกล่าวหา — never claim proven corruption.
- Market medians ≠ official CGD ราคากลาง — say so when discussing prices.
- R13 surname matches are investigation leads only, not kinship proof.`;

export type DashboardBrief = {
  model: string;
  headline: string;
  bullets: string[];
  nextSteps: string[];
  caveat: string;
};

export async function dashboardBriefWithLlm(
  pack: InvestigationPack,
  report: PipelineReportLike
): Promise<DashboardBrief | { error: string }> {
  const payload = {
    agency: report.agency?.th,
    loc: report.agency?.web,
    scanSummary: report.meta?.scanSummary,
    projectCount: Object.keys(report.projects || {}).length,
    contractorCount: Object.keys(report.contractors || {}).length,
    overall: pack.risk.overall,
    topSignals: pack.risk.signals.slice(0, 8).map((s) => ({
      ruleId: s.ruleId,
      title: s.title,
      severity: s.severity,
      explanation: s.explanation.slice(0, 220),
    })),
    related: (report.relatedParty?.matches || []).slice(0, 4).map((m) => ({
      ruleId: m.ruleId,
      matchType: m.matchType,
      explanation: m.explanation.slice(0, 180),
    })),
    leads: pack.leads.slice(0, 4).map((l) => l.question),
    topContractors: (report.topContractors || []).slice(0, 5),
  };

  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `สรุปแดชบอร์ดหน่วยงานใน ~30 วินาที อ่านจากข้อมูลนี้เท่านั้น:
${JSON.stringify(payload)}

JSON:
{
  "headline": "ประโยคเดียว",
  "bullets": ["ข้อเท็จจริงหรือสัญญาณ 4-6 ข้อ"],
  "nextSteps": ["ขั้นถัดไป 3 ข้อ"],
  "caveat": "ข้อแม้สั้น ๆ ว่าไม่ใช่ข้อพิสูจน์"
}`,
      },
    ],
    { temperature: 0.2, maxTokens: 900, json: true }
  );
  if (!result.ok) return { error: result.error };
  const parsed = parseJsonLoose<Omit<DashboardBrief, 'model'>>(result.content);
  if (!parsed?.headline) return { error: 'LLM returned invalid JSON for dashboard brief' };
  return {
    model: result.model,
    headline: parsed.headline,
    bullets: parsed.bullets || [],
    nextSteps: parsed.nextSteps || [],
    caveat: parsed.caveat || 'สัญญาณความเสี่ยงไม่ใช่ข้อพิสูจน์การทุจริต',
  };
}

export type SignalExplain = {
  model: string;
  why: string;
  evidenceHints: string[];
  falsePositiveNotes: string[];
  missingDocuments: string[];
  followUpQuestions: string[];
  caveat: string;
};

export async function explainSignalWithLlm(input: {
  agencyName?: string;
  signal: {
    ruleId?: string;
    title?: string;
    explanation?: string;
    severity?: string;
    matchType?: string;
    projectName?: string;
  };
  pack?: InvestigationPack | null;
}): Promise<SignalExplain | { error: string }> {
  const ctx = {
    agency: input.agencyName,
    signal: input.signal,
    relatedCoverage: input.pack
      ? undefined
      : undefined,
    nearbySignals: (input.pack?.risk.signals || []).slice(0, 6).map((s) => ({
      ruleId: s.ruleId,
      title: s.title,
      severity: s.severity,
    })),
  };

  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `อธิบายสัญญาณความเสี่ยงนี้ให้ผู้ตรวจเข้าใจเร็ว — ไม่กล่าวหา
${JSON.stringify(ctx)}

JSON:
{
  "why": "ทำไมสัญญาณนี้ขึ้น (2-4 ประโยค)",
  "evidenceHints": ["หลักฐาน/ฟิลด์ที่ควรดู"],
  "falsePositiveNotes": ["กรณีที่อาจไม่ผิดปกติ"],
  "missingDocuments": ["เอกสารที่ควรขอ"],
  "followUpQuestions": ["คำถามติดตาม 2-4 ข้อ"],
  "caveat": "ข้อแม้สั้น ๆ"
}`,
      },
    ],
    { temperature: 0.15, maxTokens: 1000, json: true }
  );
  if (!result.ok) return { error: result.error };
  const parsed = parseJsonLoose<Omit<SignalExplain, 'model'>>(result.content);
  if (!parsed?.why) return { error: 'LLM returned invalid JSON for signal explain' };
  return {
    model: result.model,
    why: parsed.why,
    evidenceHints: parsed.evidenceHints || [],
    falsePositiveNotes: parsed.falsePositiveNotes || [],
    missingDocuments: parsed.missingDocuments || [],
    followUpQuestions: parsed.followUpQuestions || [],
    caveat: parsed.caveat || 'เป็น lead ให้สอบสวน ไม่ใช่ข้อพิสูจน์',
  };
}

export type DocumentRequestDraft = {
  model: string;
  subject: string;
  letterBody: string;
  checklist: string[];
  legalToneNote: string;
};

export async function draftDocumentRequestWithLlm(
  pack: InvestigationPack,
  report: PipelineReportLike
): Promise<DocumentRequestDraft | { error: string }> {
  const payload = {
    agency: report.agency?.th,
    code: report.agency?.id,
    summary: pack.caseBrief.summary.slice(0, 600),
    leads: pack.leads.slice(0, 8).map((l) => ({
      question: l.question,
      why: l.why,
      missing: l.missingDocuments,
      next: l.nextActions,
      priority: l.priority,
    })),
    missingInfo: (pack.missingInfo || []).slice(0, 8).map((g) => ({
      expected: g.expected,
      observed: g.observed,
    })),
    signals: pack.risk.signals.slice(0, 8).map((s) => `${s.ruleId}: ${s.title}`),
  };

  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `ร่างหนังสือขอข้อมูล/เอกสารจากหน่วยงานราชการแบบสุภาพ เป็นทางการ ไม่กล่าวหา
จาก leads และช่องว่างข้อมูล:
${JSON.stringify(payload)}

JSON:
{
  "subject": "เรื่อง...",
  "letterBody": "เนื้อหนังสือเต็ม (ขึ้นต้นด้วยเรียน... ลงท้ายด้วยจึงเรียนมาเพื่อโปรดพิจารณา)",
  "checklist": ["รายการเอกสารที่ขอ 6-12 ข้อ"],
  "legalToneNote": "หมายเหตุโทนภาษาสั้น ๆ"
}`,
      },
    ],
    { temperature: 0.25, maxTokens: 1800, json: true }
  );
  if (!result.ok) return { error: result.error };
  const parsed = parseJsonLoose<Omit<DocumentRequestDraft, 'model'>>(result.content);
  if (!parsed?.letterBody) return { error: 'LLM returned invalid JSON for document request' };
  return {
    model: result.model,
    subject: parsed.subject || 'ขอข้อมูลประกอบการตรวจสอบการจัดซื้อจัดจ้าง',
    letterBody: parsed.letterBody,
    checklist: parsed.checklist || [],
    legalToneNote: parsed.legalToneNote || '',
  };
}

export type AnnounceExtract = {
  model: string;
  winner: string | null;
  winnerTin: string | null;
  awardAmount: string | null;
  budgetAmount: string | null;
  method: string | null;
  announceDate: string | null;
  unusualClauses: string[];
  notes: string;
  caveat: string;
};

export async function extractAnnounceWithLlm(
  plainText: string,
  meta: { url?: string; projectName?: string; projectCode?: string }
): Promise<AnnounceExtract | { error: string }> {
  const text = plainText.slice(0, 12000);
  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `สกัดข้อมูลจากข้อความประกาศ e-GP / เอกสารจัดซื้อ ด้านล่างเท่านั้น — ถ้าไม่มีในข้อความใส่ null
meta: ${JSON.stringify(meta)}
ข้อความ:
"""
${text}
"""

JSON:
{
  "winner": "ชื่อผู้ชนะหรือ null",
  "winnerTin": "เลขนิติบุคคลหรือ null",
  "awardAmount": "ราคาที่ตกลง (ข้อความเดิม) หรือ null",
  "budgetAmount": "วงเงิน/ราคากลางในเอกสารถ้ามี หรือ null",
  "method": "วิธีจัดซื้อหรือ null",
  "announceDate": "วันที่ประกาศหรือ null",
  "unusualClauses": ["เงื่อนไขที่ดูแปลก/ควรตรวจ"],
  "notes": "สรุปสั้น",
  "caveat": "ข้อแม้"
}`,
      },
    ],
    { temperature: 0.05, maxTokens: 900, json: true }
  );
  if (!result.ok) return { error: result.error };
  const parsed = parseJsonLoose<Omit<AnnounceExtract, 'model'>>(result.content);
  if (!parsed) return { error: 'LLM returned invalid JSON for announce extract' };
  return {
    model: result.model,
    winner: parsed.winner ?? null,
    winnerTin: parsed.winnerTin ?? null,
    awardAmount: parsed.awardAmount ?? null,
    budgetAmount: parsed.budgetAmount ?? null,
    method: parsed.method ?? null,
    announceDate: parsed.announceDate ?? null,
    unusualClauses: parsed.unusualClauses || [],
    notes: parsed.notes || '',
    caveat: parsed.caveat || 'สกัดจากข้อความประกาศ — ต้องตรวจต้นฉบับ',
  };
}

export type GraphStory = {
  model: string;
  story: string;
  connections: string[];
  investigateHints: string[];
  caveat: string;
};

export async function graphStoryWithLlm(input: {
  agencyName?: string;
  node: { typeLabel?: string; label?: string; sub?: string; facts?: string[] };
  connections: { label: string; rel: string }[];
  relatedMatches?: { ruleId?: string; matchType?: string; explanation?: string }[];
}): Promise<GraphStory | { error: string }> {
  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `เล่าเรื่องสั้นจากโหนดกราฟความสัมพันธ์นี้ — เน้นสิ่งที่ควรตรวจ ไม่กล่าวหา
${JSON.stringify(input)}

JSON:
{
  "story": "ย่อหน้า 3-6 ประโยค",
  "connections": ["ความเชื่อมที่สำคัญ"],
  "investigateHints": ["ประเด็นที่ควรตรวจ"],
  "caveat": "ข้อแม้ — โดยเฉพาะถ้านามสกุลร่วม"
}`,
      },
    ],
    { temperature: 0.25, maxTokens: 900, json: true }
  );
  if (!result.ok) return { error: result.error };
  const parsed = parseJsonLoose<Omit<GraphStory, 'model'>>(result.content);
  if (!parsed?.story) return { error: 'LLM returned invalid JSON for graph story' };
  return {
    model: result.model,
    story: parsed.story,
    connections: parsed.connections || [],
    investigateHints: parsed.investigateHints || [],
    caveat: parsed.caveat || 'ความสัมพันธ์เป็นตัวชี้ ไม่ใช่ข้อพิสูจน์',
  };
}

export type PeerNarrative = {
  model: string;
  headline: string;
  narrative: string;
  peerPoints: string[];
  dataGaps: string[];
  caveat: string;
};

export async function peerNarrativeWithLlm(input: {
  agencyName?: string;
  project: {
    name?: string;
    award?: string;
    budget?: string;
    method?: string;
    winner?: string;
    year?: string;
  };
  benchmark?: {
    median?: number | string;
    scope?: string;
    n?: number;
    note?: string;
    compareMode?: string;
  } | null;
  peers?: { name?: string; award?: string; agency?: string }[];
}): Promise<PeerNarrative | { error: string }> {
  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `เล่าการเปรียบเทียบราคากับงานคล้ายกันจากตัวเลขที่ให้เท่านั้น — ย้ำว่าไม่ใช่ราคากลางราชการ
${JSON.stringify(input)}

JSON:
{
  "headline": "ประโยคเดียว",
  "narrative": "ย่อหน้าสั้น",
  "peerPoints": ["จุดเปรียบเทียบ 3-5 ข้อ"],
  "dataGaps": ["ช่องว่างข้อมูล"],
  "caveat": "ข้อแม้"
}`,
      },
    ],
    { temperature: 0.2, maxTokens: 1000, json: true }
  );
  if (!result.ok) return { error: result.error };
  const parsed = parseJsonLoose<Omit<PeerNarrative, 'model'>>(result.content);
  if (!parsed?.narrative) return { error: 'LLM returned invalid JSON for peer narrative' };
  return {
    model: result.model,
    headline: parsed.headline || '',
    narrative: parsed.narrative,
    peerPoints: parsed.peerPoints || [],
    dataGaps: parsed.dataGaps || [],
    caveat: parsed.caveat || 'ค่ากลางตลาดจากแคชสัญญา — ไม่ใช่ราคากลางราชการ',
  };
}
