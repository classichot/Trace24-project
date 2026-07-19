import 'server-only';

import { chatCompletion, parseJsonLoose } from './client';
import {
  parseProjectQuantity,
  unitRateFromAward,
  type UnitRateKind,
} from '@/lib/parse-project-quantity';
import { resolveProjectBenchmark } from '@/lib/pipeline/price-benchmark';
import type { PipelineReportLike } from '@/lib/pipeline/types';
import { serviceSimilarity, servicesSimilar } from '@/lib/title-similarity';

const GUARDRAILS = `You assist TRACE24, a Thai municipal procurement integrity tool.
Rules:
- Never invent URLs, contract IDs, winners, or amounts not present in the provided evidence.
- Risk scores and red-flag severity must remain driven by deterministic rules — you may explain and prioritize questions only.
- Write in Thai unless the user asks otherwise.
- Distinguish: สัญญาณที่อธิบายได้ vs ข้อกล่าวหา — never claim proven corruption.
- Market medians from contracts-cache are NOT official CGD ราคากลาง — always say so.
- When unit-rate data exists (บาท/กม., บาท/ม., บาท/ตร.ม., บาท/ลบ.ม., บาท/หน่วย), it is the PRIMARY comparison metric — lead with it in headline and marketPosition; whole-contract totals are secondary context only.
- Prefer actionable investigation steps and missing documents.
- Peer evidence is already filtered to similar work only (>90% title/service). Never treat unlike services in the same coarse category as peers. If peers[] is empty, say there are no similar-work peers in the agency.
- TRACE24 disclosure policy: if the agency omits details that make verification or price comparison difficult (no usable quantity/specs/width/thickness/unit rate, only whole-contract total, missing TOR-level fields), you MUST presume information concealment (สันนิษฐานปิดบังข้อมูล) until documents fill the gaps. State this clearly — it is a working presumption for investigation, not a proven accusation.`;

const CONCEALMENT_PREMISE =
  'สันนิษฐานปิดบังข้อมูลไว้ก่อน — รายละเอียดที่เปิดเผยไม่ครบจนตรวจหรือเปรียบเทียบลำบาก จนกว่าหน่วยงานจะเปิดเผย TOR/BOQ/สเปกที่เติมช่องว่างได้';

function assessDisclosureGaps(payload: PriceComparePayload): {
  dataGaps: string[];
  concealmentPresumption: boolean;
  concealmentPremise: string;
} {
  const gaps: string[] = [];
  const q = payload.project.quantity;
  const name = payload.project.name || '';
  const needsSpecs =
    /ถนน|คอนกรีต|ลาดยาง|หินคลุก|หินเกล็ด|ลูกรัง|ท่อระบาย|คสล\.|อาคาร|ผิวจราจร|ก่อสร้าง|ซ่อมแซมถนน/i.test(
      name
    );

  if (!q.unitRate) {
    gaps.push('ไม่มีอัตราต่อหน่วยที่คำนวณได้จากชื่องาน/ระเบียน');
  }
  if (!q.unitRate && payload.benchmark?.compareMode === 'contract') {
    gaps.push('เปรียบเทียบได้แค่ราคารวมทั้งสัญญา');
  }
  if (needsSpecs && q.widthM == null) {
    gaps.push('ไม่ระบุความกว้าง ซึ่งจำเป็นต่อการเทียบสเปกงานทาง/วัสดุ');
  }
  if (needsSpecs && /ถนน|คอนกรีต|ลาดยาง|หินคลุก/i.test(name) && !q.quantityLabel) {
    gaps.push('ปริมาณ/สเปกในชื่องานไม่ครบสำหรับการเทียบอัตราต่อหน่วยอย่างยุติธรรม');
  }

  const concealmentPresumption = gaps.length > 0;
  return {
    dataGaps: gaps,
    concealmentPresumption,
    concealmentPremise: concealmentPresumption ? CONCEALMENT_PREMISE : '',
  };
}

export type PriceComparePayload = {
  agency: { id: string; name: string; province: string };
  project: {
    id: string;
    code: string;
    name: string;
    category: string;
    method: string;
    fy: string;
    budget: string;
    award: string;
    awardN: number | null;
    pct: string;
    winnerName: string;
    winnerId: string;
    alerts: { tag: string; title: string; sevKey: string }[];
    quantity: {
      widthM: number | null;
      lengthM: number | null;
      lengthKm: number | null;
      areaM2: number | null;
      unitRateKind: string | null;
      unitRate: number | null;
      unitRateLabel: string | null;
      quantityLabel: string | null;
    };
  };
  benchmark: {
    categoryId: string;
    categoryLabel: string;
    scope: string;
    n: number;
    median: number;
    p25: number;
    p75: number;
    award: number;
    ratio: number;
    vsMedianPct: number;
    note: string;
    compareMode: 'contract' | 'unit';
    unitKind?: string;
    unitLabel?: string;
    quantityLabel?: string;
    unitRateLabel?: string;
  } | null;
  peers: {
    id: string;
    name: string;
    award: string;
    awardN: number | null;
    method: string;
    fy: string;
    pct: string;
    winnerName: string;
    lengthKm: number | null;
    areaM2: number | null;
    unitRateLabel: string | null;
    /** Title/service similarity score vs target project (must be > 0.9 to be included). */
    similarity: number;
  }[];
};

export type PriceCompareResult = {
  model: string;
  headline: string;
  marketPosition: string;
  unitRateAnalysis: string;
  categoryFit: string;
  peerNotes: string;
  caveats: string[];
  documentsToRequest: string[];
  nextSteps: string[];
  disclaimer: string;
  /** Working presumption when details block audit/compare — not a proven accusation. */
  concealmentPresumption: boolean;
  concealmentPremise: string;
  dataGaps: string[];
};

type ProjectRow = {
  code?: string;
  name?: string;
  cat?: string;
  method?: string;
  methodShort?: string;
  fy?: string;
  budget?: string;
  award?: string;
  awardN?: number;
  pct?: string;
  winner?: string | null;
  workCategoryId?: string;
  alerts?: { tag?: string; title?: string; sevKey?: string }[];
  priceBenchmark?: {
    categoryId?: string;
    categoryLabel?: string;
    scope?: string;
    n?: number;
    median?: number;
    p25?: number;
    p75?: number;
    award?: number;
    ratio?: number;
    vsMedianPct?: number;
    note?: string;
    compareMode?: 'contract' | 'unit';
    unitKind?: string;
    unitLabel?: string;
    quantityLabel?: string;
    unitRateLabel?: string;
    unitRate?: number;
    quantity?: number;
  };
};

function moneyN(p: ProjectRow): number | null {
  if (typeof p.awardN === 'number' && p.awardN > 0) return p.awardN;
  const n = Number(String(p.award || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function buildPriceComparePayload(
  agencyId: string,
  report: PipelineReportLike,
  projectId: string
): PriceComparePayload | { error: string } {
  const projects = (report.projects || {}) as Record<string, ProjectRow>;
  const contractors = (report.contractors || {}) as Record<string, { name?: string }>;
  const project = projects[projectId];
  if (!project) return { error: 'project_not_found' };

  const province = (report.agency as { prov?: string } | undefined)?.prov || '';
  const awardN = moneyN(project);
  const parsed = parseProjectQuantity(project.name || '');

  const similarPeerAwards: number[] = [];
  const similarPeerUnitRates: Partial<Record<UnitRateKind, number[]>> = {};
  for (const p of Object.values(projects)) {
    if (p === project) continue;
    const n = moneyN(p);
    if (!n) continue;
    if (!servicesSimilar(project.name || '', p.name || '')) continue;
    similarPeerAwards.push(n);
    const pq = parseProjectQuantity(p.name || '');
    for (const kind of Object.keys(pq.rates) as UnitRateKind[]) {
      const qty = pq.rates[kind]?.qty;
      if (!qty) continue;
      const rate = unitRateFromAward(n, kind, qty);
      if (!rate) continue;
      if (!similarPeerUnitRates[kind]) similarPeerUnitRates[kind] = [];
      similarPeerUnitRates[kind]!.push(rate);
    }
  }

  let bm = project.priceBenchmark || null;
  if ((!bm || !bm.compareMode || !bm.n) && awardN) {
    bm = resolveProjectBenchmark({
      projectName: project.name || '',
      award: awardN,
      province,
      similarPeerAwards,
      similarPeerUnitRates,
    });
  }

  const winnerId = project.winner || '';
  const unitKind = (bm?.unitKind ||
    (parsed.rates.baht_per_m3
      ? 'baht_per_m3'
      : parsed.rates.baht_per_kw
        ? 'baht_per_kw'
        : parsed.rates.baht_per_piece
          ? 'baht_per_piece'
          : parsed.rates.baht_per_km
            ? 'baht_per_km'
            : parsed.rates.baht_per_m2
              ? 'baht_per_m2'
              : parsed.rates.baht_per_m
                ? 'baht_per_m'
                : null)) as UnitRateKind | null;

  // Peers must be similar work (>90% title/service) — never whole coarse category
  // (e.g. หินคลุก must not peer with นม / รปภ. / พัดลม just because both are "จัดซื้ออื่น").
  const targetName = project.name || '';
  const peers = Object.entries(projects)
    .filter(([id, p]) => {
      if (id === projectId) return false;
      if (!moneyN(p)) return false;
      return servicesSimilar(targetName, p.name || '');
    })
    .map(([id, p]) => {
      const pq = parseProjectQuantity(p.name || '');
      const n = moneyN(p);
      const similarity = serviceSimilarity(targetName, p.name || '');
      let unitRateLabel: string | null = p.priceBenchmark?.unitRateLabel || null;
      if (!unitRateLabel && n && unitKind && pq.rates[unitKind]?.qty) {
        const rate = unitRateFromAward(n, unitKind, pq.rates[unitKind]!.qty);
        if (rate) {
          unitRateLabel = `${Math.round(rate).toLocaleString('th-TH')} ${
            unitKind === 'baht_per_km'
              ? 'บาท/กม.'
              : unitKind === 'baht_per_m2'
                ? 'บาท/ตร.ม.'
                : unitKind === 'baht_per_m3'
                  ? 'บาท/ลบ.ม.'
                  : unitKind === 'baht_per_kw'
                    ? 'บาท/กิโลวัตต์'
                    : unitKind === 'baht_per_piece'
                      ? `บาท/${pq.pieceLabel || 'หน่วย'}`
                      : 'บาท/ม.'
          }`;
        }
      }
      return {
        id,
        name: p.name || id,
        award: p.award || '—',
        awardN: n,
        method: p.method || p.methodShort || '—',
        fy: p.fy || '—',
        pct: p.pct || '—',
        winnerName: p.winner
          ? contractors[p.winner]?.name?.trim() || (/^c\d+$/i.test(p.winner) ? '—' : p.winner)
          : '—',
        lengthKm: pq.lengthKm,
        areaM2: pq.areaM2,
        unitRateLabel,
        similarity,
      };
    })
    .sort((a, b) => b.similarity - a.similarity || (b.awardN || 0) - (a.awardN || 0))
    .slice(0, 8);

  return {
    agency: {
      id: agencyId,
      name: report.agency?.th || agencyId,
      province,
    },
    project: {
      id: projectId,
      code: project.code || projectId,
      name: project.name || '—',
      category: project.cat || bm?.categoryLabel || '—',
      method: project.method || project.methodShort || '—',
      fy: project.fy || '—',
      budget: project.budget || '—',
      award: project.award || '—',
      awardN,
      pct:
        project.pct ||
        (bm && typeof bm.vsMedianPct === 'number'
          ? `${bm.vsMedianPct >= 0 ? '+' : ''}${bm.vsMedianPct.toFixed(1)}%`
          : '—'),
      winnerName: winnerId
        ? contractors[winnerId]?.name?.trim() || (/^c\d+$/i.test(winnerId) ? '—' : winnerId)
        : '—',
      winnerId: winnerId || '',
      alerts: (project.alerts || []).slice(0, 6).map((a) => ({
        tag: a.tag || '',
        title: a.title || '',
        sevKey: a.sevKey || 'Low',
      })),
      quantity: {
        widthM: parsed.widthM,
        lengthM: parsed.lengthM,
        lengthKm: parsed.lengthKm,
        areaM2: parsed.areaM2,
        unitRateKind: bm?.unitKind || unitKind,
        unitRate: bm?.unitRate ?? null,
        unitRateLabel: bm?.unitRateLabel || null,
        quantityLabel: bm?.quantityLabel || null,
      },
    },
    benchmark: bm
      ? {
          categoryId: bm.categoryId || '',
          categoryLabel: bm.categoryLabel || '',
          scope: bm.scope || '',
          n: bm.n || 0,
          median: bm.median || 0,
          p25: bm.p25 || 0,
          p75: bm.p75 || 0,
          award: bm.award || 0,
          ratio: bm.ratio || 0,
          vsMedianPct: bm.vsMedianPct || 0,
          note: bm.note || '',
          compareMode: bm.compareMode || 'contract',
          unitKind: bm.unitKind,
          unitLabel: bm.unitLabel,
          quantityLabel: bm.quantityLabel,
          unitRateLabel: bm.unitRateLabel,
        }
      : null,
    peers,
  };
}

export async function comparePriceWithLlm(
  payload: PriceComparePayload
): Promise<PriceCompareResult | { error: string }> {
  const disclosure = assessDisclosureGaps(payload);
  // Omit internal contractor ids (c1…) from the LLM context — names only
  const { winnerId: _winnerId, ...projectForLlm } = payload.project;
  const llmPayload = { ...payload, project: projectForLlm };
  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `วิเคราะห์เปรียบเทียบราคาโครงการแบบละเอียด
กฎหลัก: ถ้ามีอัตราต่อหน่วย (unitRate / compareMode=unit) ต้องใช้เป็นตัวเปรียบเทียบหลักใน headline และ marketPosition — ราคารวมทั้งสัญญาเป็นบริบทรองเท่านั้น
ตัวอย่าง: หินคลุก — เทียบ บาท/ลบ.ม. · ถนน — เทียบ บาท/กม. หรือ บาท/ตร.ม. ไม่ใช่แค่ราคารวม
ใช้เฉพาะข้อมูลด้านล่าง — ห้ามแต่งตัวเลข/ผู้ชนะ/URL/ปริมาณ
อ้างชื่อบริษัทและชื่อโครงการจากข้อมูล — ห้ามอ้างรหัสภายในอย่างเดียว
ย้ำเสมอว่าค่ากลางตลาดจากแคชสัญญา ≠ ราคากลางราชการ
ถ้า parse ปริมาณจากชื่ออาจคลาดเคลื่อน (ความกว้างต่างกัน / ไม่มีหนา) ให้ระบุใน caveats

นโยบายเปิดเผยข้อมูล TRACE24 (บังคับใช้):
- concealmentPresumption=${disclosure.concealmentPresumption}
- dataGaps=${JSON.stringify(disclosure.dataGaps)}
- ถ้า concealmentPresumption=true ต้องใส่ presumption นี้ใน headline หรือประโยคแรกของ marketPosition และต้องเป็นข้อแรกใน caveats ว่า "${CONCEALMENT_PREMISE}"
- อย่าลดน้ำหนักช่องว่างข้อมูลเป็นเพียง "ข้อแม้ทางเทคนิค" — ให้ถือเป็นสัญญาณปิดบังข้อมูลจนกว่าจะมีเอกสารครบ

ข้อมูล:
${JSON.stringify(llmPayload, null, 2)}

ตอบเป็น JSON เท่านั้น:
{
  "headline": "สรุป 1 ประโยค — ขึ้นต้นด้วยอัตราต่อหน่วยถ้ามี (เช่น บาท/ลบ.ม.) แล้วค่อย presumption ถ้ามี",
  "marketPosition": "ถ้ามี unit rate ให้เทียบค่ากลาง/peer ต่อหน่วยก่อน แล้วค่อยพูดราคารวมเป็นรอง — 2-3 ประโยค",
  "unitRateAnalysis": "วิเคราะห์บาท/ลบ.ม. หรือบาท/กม./ตร.ม./ม. เทียบค่ากลางและ peer — ถ้าไม่มีปริมาณให้อธิบายและเชื่อม presumption",
  "categoryFit": "หมวดจากชื่อเหมาะไหม · ความกว้าง/ความหนา/สเปกทำให้เทียบไม่ได้แค่ไหน",
  "peerNotes": "เทียบเฉพาะ peer งานคล้าย (>90%) ใน evidence.peers — ถ้าว่างให้บอกชัดว่าไม่พบงานคล้ายในหน่วยงาน ห้ามอ้างนม/รปภ./พัดลมเป็น peer ของวัสดุก่อสร้าง",
  "caveats": ["ข้อแม้ 2-5 ข้อ — ข้อแรกต้องเป็น presumption ปิดบังถ้ามีช่องว่าง"],
  "documentsToRequest": ["เอกสารที่ควรขอ เช่น TOR แบบก่อสร้าง ปริมาณงาน BOQ ราคากลางราชการ ความกว้าง-ยาว-หนาจริง"],
  "nextSteps": ["ขั้นตอนถัดไป 3-5 ข้อ"],
  "disclaimer": "ประโยคสั้น: วิเคราะห์จากข้อมูลสาธารณะ · presumption ไม่ใช่ข้อกล่าวหา · ไม่ใช่ราคากลางราชการ"
}`,
      },
    ],
    { temperature: 0.12, maxTokens: 1800, json: true }
  );

  if (!result.ok) return { error: result.error };
  const parsed = parseJsonLoose<Omit<PriceCompareResult, 'model'>>(result.content);
  if (!parsed?.headline || !parsed?.marketPosition) {
    return { error: 'LLM returned invalid JSON for price compare' };
  }

  let caveats = [...(parsed.caveats || [])];
  if (disclosure.concealmentPresumption) {
    const hasPremise = caveats.some((c) => /ปิดบังข้อมูล|สันนิษฐาน/i.test(c));
    if (!hasPremise) caveats = [CONCEALMENT_PREMISE, ...caveats];
  }

  return {
    model: result.model,
    headline: parsed.headline,
    marketPosition: parsed.marketPosition,
    unitRateAnalysis: parsed.unitRateAnalysis || '',
    categoryFit: parsed.categoryFit || '',
    peerNotes: parsed.peerNotes || '',
    caveats,
    documentsToRequest: parsed.documentsToRequest || [],
    nextSteps: parsed.nextSteps || [],
    disclaimer:
      parsed.disclaimer ||
      'วิเคราะห์จากข้อมูลสาธารณะและค่ากลางตลาดในแคชสัญญา — ไม่ใช่ราคากลางราชการ · สันนิษฐานปิดบังข้อมูลเมื่อรายละเอียดไม่ครบ (ยังไม่ใช่ข้อกล่าวหา)',
    concealmentPresumption: disclosure.concealmentPresumption,
    concealmentPremise: disclosure.concealmentPremise,
    dataGaps: disclosure.dataGaps,
  };
}
