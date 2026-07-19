import 'server-only';

import { chatCompletion, parseJsonLoose } from '@/lib/llm/client';
import type { AuditObservationPack, MoneyObservation } from './observation-pack';

const GUARDRAILS = `You assist TRACE24 for Thai public-procurement oversight (สตง. ปปช. ปปท. ตำรวจ สอบสวน).
Rules:
- Never invent amounts, winners, project IDs, or URLs not in the input.
- Always name companies and projects by the Thai names in the input — do not refer only to numeric e-GP codes or internal ids.
- Explain suspicion as investigation leads — never claim proven corruption.
- Write in Thai. Be concrete: what looks odd, why it matters for money oversight, what would clear it.
- Market medians ≠ official CGD ราคากลาง — say so when prices are involved.
- Do not change risk scores; only narrate.`;

type AiItem = {
  id: string;
  suspicionWhy: string;
  innocentAlternative?: string;
  whatToVerify?: string;
};

type AiPayload = {
  executiveSummary?: string;
  items?: AiItem[];
};

const MAX_ITEMS = 12;

/** Enrich observation pack with AI suspicion narratives (batch). */
export async function enrichObservationPackWithAi(
  pack: AuditObservationPack
): Promise<AuditObservationPack & { aiModel?: string; aiError?: string }> {
  if (pack.observations.length === 0) {
    return {
      ...pack,
      aiNarrative: 'ไม่พบประเด็นมูลค่าเงินในแคชนี้ — ยังไม่มีรายการให้อธิบายความน่าสงสัย',
    };
  }

  const slice = pack.observations.slice(0, MAX_ITEMS);
  const payload = {
    agency: pack.agencyName,
    province: pack.province,
    agencyType: pack.agencyType,
    summary: pack.summary,
    topWinners: pack.topWinners.slice(0, 5),
    observations: slice.map((o) => ({
      id: o.id,
      section: o.section,
      ruleTag: o.ruleTag,
      severity: o.severity,
      project: o.projectName,
      egpCode: o.projectId !== '—' ? o.projectId : undefined,
      winner: o.winner,
      award: o.award,
      budget: o.budget,
      fy: o.fy,
      signalText: o.text.slice(0, 320),
      suggestedCheck: o.suggestedCheck,
    })),
  };

  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `อธิบายความน่าสงสัยของแต่ละประเด็นมูลค่าเงินด้านล่าง สำหรับผู้ตรวจสอบ/พนักงานสอบสวน
ใช้เฉพาะข้อมูลที่ให้มา อย่าแต่งตัวเลขหรือชื่อผู้ชนะใหม่

${JSON.stringify(payload)}

ตอบ JSON:
{
  "executiveSummary": "สรุปภาพรวม 3-5 ประโยคว่าทำไมชุดนี้ควรตรวจต่อ (ไม่กล่าวหา)",
  "items": [
    {
      "id": "obs-1",
      "suspicionWhy": "อธิบาย 3-5 ประโยคว่าทำไมประเด็นนี้น่าสงสัยด้านมูลค่า/กระบวนการ ชัดเจน อ่านแล้วเข้าใจทันที",
      "innocentAlternative": "คำอธิบายที่เป็นไปได้โดยสุจริต 1-2 ประโยค",
      "whatToVerify": "สิ่งที่ต้องขอ/ตรวจยืนยัน 1-2 ประโยค"
    }
  ]
}

ต้องมี items ครบทุก id ที่ส่งไป (${slice.map((o) => o.id).join(', ')})`,
      },
    ],
    { temperature: 0.25, maxTokens: 3200, json: true }
  );

  if (!result.ok) {
    return { ...pack, aiError: result.error };
  }

  const parsed = parseJsonLoose<AiPayload>(result.content);
  if (!parsed?.items?.length) {
    return { ...pack, aiError: 'AI คืนรูปแบบไม่ถูกต้อง', aiModel: result.model };
  }

  const byId = new Map(parsed.items.map((it) => [it.id, it]));
  const observations: MoneyObservation[] = pack.observations.map((o) => {
    const ai = byId.get(o.id);
    if (!ai?.suspicionWhy) return o;
    return {
      ...o,
      suspicionWhy: String(ai.suspicionWhy).trim(),
      innocentAlternative: ai.innocentAlternative
        ? String(ai.innocentAlternative).trim()
        : undefined,
      whatToVerify: ai.whatToVerify ? String(ai.whatToVerify).trim() : undefined,
    };
  });

  return {
    ...pack,
    observations,
    aiNarrative: parsed.executiveSummary?.trim() || undefined,
    aiModel: result.model,
  };
}
