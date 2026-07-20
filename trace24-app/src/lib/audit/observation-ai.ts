import 'server-only';

import { chatCompletion, parseJsonLoose } from '@/lib/llm/client';
import type { AuditObservationPack, MoneyObservation } from './observation-types';

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
แต่ละข้อต้องมีครบ 3 ส่วน: ทำไมน่าสงสัย / คำอธิบายที่เป็นไปได้ (สุจริต) / แนวทางตรวจยืนยัน

${JSON.stringify(payload)}

ตอบ JSON:
{
  "executiveSummary": "สรุปภาพรวม 3-5 ประโยคว่าทำไมชุดนี้ควรตรวจต่อ (ไม่กล่าวหา)",
  "items": [
    {
      "id": "obs-1",
      "suspicionWhy": "ทำไมน่าสงสัย 2-4 ประโยค อ่านแล้วเข้าใจทันที ผูกกับชื่อโครงการ/ผู้รับจ้าง/มูลค่าในข้อมูล",
      "innocentAlternative": "คำอธิบายที่เป็นไปได้โดยสุจริต 1-2 ประโยค",
      "whatToVerify": "แนวทางตรวจยืนยัน: เอกสาร/ข้อเท็จจริงที่ต้องขอหรือเทียบ 1-3 ประโยค"
    }
  ]
}

ต้องมี items ครบทุก id ที่ส่งไป (${slice.map((o) => o.id).join(', ')})`,
      },
    ],
    { temperature: 0.25, maxTokens: 4000, json: true }
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
    if (!ai) return o;
    // Overlay AI text onto rule-based leads; keep templates when AI omits a field
    return {
      ...o,
      suspicionWhy: ai.suspicionWhy?.trim() || o.suspicionWhy,
      innocentAlternative: ai.innocentAlternative?.trim() || o.innocentAlternative,
      whatToVerify: ai.whatToVerify?.trim() || o.whatToVerify,
    };
  });

  return {
    ...pack,
    observations,
    aiNarrative: parsed.executiveSummary?.trim() || undefined,
    aiModel: result.model,
  };
}
