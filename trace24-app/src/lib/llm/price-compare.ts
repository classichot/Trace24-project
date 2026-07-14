import 'server-only';

import { chatCompletion, parseJsonLoose } from './client';
import {
  parseProjectQuantity,
  unitRateFromAward,
  type UnitRateKind,
} from '@/lib/parse-project-quantity';
import { resolveProjectBenchmark, type WorkCategoryId } from '@/lib/pipeline/price-benchmark';
import type { PipelineReportLike } from '@/lib/pipeline/types';

const GUARDRAILS = `You assist TRACE24, a Thai municipal procurement integrity tool.
Rules:
- Never invent URLs, contract IDs, winners, or amounts not present in the provided evidence.
- Risk scores and red-flag severity must remain driven by deterministic rules — you may explain and prioritize questions only.
- Write in Thai unless the user asks otherwise.
- Distinguish: สัญญาณที่อธิบายได้ vs ข้อกล่าวหา — never claim proven corruption.
- Market medians from contracts-cache are NOT official CGD ราคากลาง — always say so.
- Prefer unit-rate comparison (บาท/กม., บาท/ม., บาท/ตร.ม.) over whole-contract totals when quantity is available.
- Prefer actionable investigation steps and missing documents.`;

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

  const peerByCat: Partial<Record<WorkCategoryId, number[]>> = {};
  const peerUnitByCat: Partial<
    Record<WorkCategoryId, Partial<Record<UnitRateKind, number[]>>>
  > = {};
  for (const p of Object.values(projects)) {
    const n = moneyN(p);
    if (!n) continue;
    const id = (p.priceBenchmark?.categoryId || p.workCategoryId || 'other') as WorkCategoryId;
    if (!peerByCat[id]) peerByCat[id] = [];
    peerByCat[id]!.push(n);
    const pq = parseProjectQuantity(p.name || '');
    for (const kind of Object.keys(pq.rates) as UnitRateKind[]) {
      const qty = pq.rates[kind]?.qty;
      if (!qty) continue;
      const rate = unitRateFromAward(n, kind, qty);
      if (!rate) continue;
      if (!peerUnitByCat[id]) peerUnitByCat[id] = {};
      if (!peerUnitByCat[id]![kind]) peerUnitByCat[id]![kind] = [];
      peerUnitByCat[id]![kind]!.push(rate);
    }
  }

  let bm = project.priceBenchmark || null;
  if ((!bm || !bm.compareMode) && awardN) {
    bm = resolveProjectBenchmark({
      projectName: project.name || '',
      award: awardN,
      province,
      agencyPeerAwardsByCategory: peerByCat,
      agencyPeerUnitRatesByCategory: peerUnitByCat,
    });
  }

  const catId = bm?.categoryId || project.workCategoryId || '';
  const winnerId = project.winner || '';
  const unitKind = (bm?.unitKind ||
    (parsed.rates.baht_per_kw
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

  const peers = Object.entries(projects)
    .filter(([id, p]) => {
      if (id === projectId) return false;
      const peerCat = p.priceBenchmark?.categoryId || p.workCategoryId || '';
      if (catId && peerCat) return peerCat === catId;
      if (bm?.categoryLabel && p.cat) return p.cat === bm.categoryLabel;
      return false;
    })
    .map(([id, p]) => {
      const pq = parseProjectQuantity(p.name || '');
      const n = moneyN(p);
      let unitRateLabel: string | null = p.priceBenchmark?.unitRateLabel || null;
      if (!unitRateLabel && n && unitKind && pq.rates[unitKind]?.qty) {
        const rate = unitRateFromAward(n, unitKind, pq.rates[unitKind]!.qty);
        if (rate) {
          unitRateLabel = `${Math.round(rate).toLocaleString('th-TH')} ${
            unitKind === 'baht_per_km'
              ? 'บาท/กม.'
              : unitKind === 'baht_per_m2'
                ? 'บาท/ตร.ม.'
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
        winnerName: p.winner ? contractors[p.winner]?.name || p.winner : '—',
        lengthKm: pq.lengthKm,
        areaM2: pq.areaM2,
        unitRateLabel,
      };
    })
    .sort((a, b) => (b.awardN || 0) - (a.awardN || 0))
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
      winnerName: winnerId ? contractors[winnerId]?.name || winnerId : '—',
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
  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `วิเคราะห์เปรียบเทียบราคาโครงการแบบละเอียด โดยเน้นอัตราต่อหน่วยเมื่อมีข้อมูล
ตัวอย่างที่ดี: ถนน — เทียบ บาทต่อกิโลเมตร (และบาท/ตร.ม. ถ้ามี) ไม่ใช่แค่ราคารวมทั้งสัญญา
ใช้เฉพาะข้อมูลด้านล่าง — ห้ามแต่งตัวเลข/ผู้ชนะ/URL/ปริมาณ
ย้ำเสมอว่าค่ากลางตลาดจากแคชสัญญา ≠ ราคากลางราชการ
ถ้า parse ปริมาณจากชื่ออาจคลาดเคลื่อน (ความกว้างต่างกัน / ไม่มีหนา) ให้ระบุใน caveats

ข้อมูล:
${JSON.stringify(payload, null, 2)}

ตอบเป็น JSON เท่านั้น:
{
  "headline": "สรุป 1 ประโยค เน้นอัตราต่อหน่วยถ้ามี",
  "marketPosition": "ตำแหน่งราคารวมและเทียบ median สัญญา — 2-3 ประโยค",
  "unitRateAnalysis": "วิเคราะห์บาท/กม. หรือบาท/ตร.ม./บาท/ม. เทียบค่ากลางและ peer — ถ้าไม่มีปริมาณให้อธิบายว่าทำไมเทียบทั้งสัญญาอย่างเดียว",
  "categoryFit": "หมวดจากชื่อเหมาะไหม · ความกว้าง/ความหนา/สเปกทำให้เทียบไม่ได้แค่ไหน",
  "peerNotes": "เทียบ peer ในหน่วยงานแบบต่อหน่วยถ้าทำได้",
  "caveats": ["ข้อแม้ 2-5 ข้อ"],
  "documentsToRequest": ["เอกสารที่ควรขอ เช่น TOR แบบก่อสร้าง ปริมาณงาน BOQ ราคากลางราชการ ความกว้าง-ยาว-หนาจริง"],
  "nextSteps": ["ขั้นตอนถัดไป 3-5 ข้อ"],
  "disclaimer": "ประโยคสั้น: วิเคราะห์จากข้อมูลสาธารณะ ไม่ใช่ข้อกล่าวหา และไม่ใช่ราคากลางราชการ"
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

  return {
    model: result.model,
    headline: parsed.headline,
    marketPosition: parsed.marketPosition,
    unitRateAnalysis: parsed.unitRateAnalysis || '',
    categoryFit: parsed.categoryFit || '',
    peerNotes: parsed.peerNotes || '',
    caveats: parsed.caveats || [],
    documentsToRequest: parsed.documentsToRequest || [],
    nextSteps: parsed.nextSteps || [],
    disclaimer:
      parsed.disclaimer ||
      'วิเคราะห์จากข้อมูลสาธารณะและค่ากลางตลาดในแคชสัญญา — ไม่ใช่ราคากลางราชการ และไม่ใช่ข้อกล่าวหา',
  };
}
