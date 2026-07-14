/**
 * Market price benchmarks from contracts-cache (NOT official CGD ราคากลาง).
 * Supports whole-contract medians and unit rates (บาท/กม., บาท/ม., บาท/ตร.ม.).
 */
import 'server-only';

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {
  formatQuantity,
  formatUnitRate,
  parseProjectQuantity,
  preferredUnitRateKind,
  unitRateFromAward,
  UNIT_RATE_LABELS,
  type ParsedProjectQuantity,
  type UnitRateKind,
} from '@/lib/parse-project-quantity';
import { categorizeWork, type WorkCategoryId } from '@/lib/work-categories';

export type { WorkCategoryId };
export { categorizeWork };

export type BenchmarkBucket = {
  label: string;
  n: number;
  median: number;
  p25: number;
  p75: number;
  unitLabel?: string;
  byProvince?: Record<string, BenchmarkBucket>;
};

export type PriceBenchmarkFile = {
  generatedAt: string;
  source: string;
  note: string;
  categories: Record<
    string,
    BenchmarkBucket & {
      byProvince?: Record<string, BenchmarkBucket>;
      byUnit?: Partial<Record<UnitRateKind, BenchmarkBucket>>;
    }
  >;
};

export type ProjectPriceBenchmark = {
  categoryId: WorkCategoryId;
  categoryLabel: string;
  scope: 'national' | 'province' | 'agency';
  n: number;
  median: number;
  p25: number;
  p75: number;
  award: number;
  /** award / median — 1 = at median */
  ratio: number;
  /** ((award - median) / median) * 100 */
  vsMedianPct: number;
  note: string;
  /** contract = เทียบทั้งสัญญา · unit = เทียบอัตราต่อหน่วย */
  compareMode: 'contract' | 'unit';
  unitKind?: UnitRateKind;
  unitLabel?: string;
  quantity?: number;
  quantityLabel?: string;
  unitRate?: number;
  unitRateLabel?: string;
  parsed?: {
    widthM: number | null;
    lengthM: number | null;
    lengthKm: number | null;
    areaM2: number | null;
  };
};

export function parseMoneyLoose(s: unknown): number {
  const n = Number(String(s ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function bucketFromAwards(label: string, awards: number[]): BenchmarkBucket | null {
  const vals = awards.filter((n) => n > 0).sort((a, b) => a - b);
  if (vals.length < 3) return null;
  return {
    label,
    n: vals.length,
    median: percentile(vals, 0.5),
    p25: percentile(vals, 0.25),
    p75: percentile(vals, 0.75),
  };
}

export function formatBenchmarkBaht(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' บาท';
}

function compareValues(
  value: number,
  category: { id: WorkCategoryId; label: string },
  bucket: BenchmarkBucket,
  scope: ProjectPriceBenchmark['scope'],
  extras: Partial<ProjectPriceBenchmark>
): ProjectPriceBenchmark | null {
  if (!value || !bucket?.median) return null;
  const ratio = value / bucket.median;
  const vsMedianPct = ((value - bucket.median) / bucket.median) * 100;
  const compareMode = extras.compareMode || 'contract';
  const unitNote =
    compareMode === 'unit' && extras.unitLabel
      ? `อัตรา ${extras.unitRateLabel || formatUnitRate(value, extras.unitKind!)} เทียบค่ากลาง ${formatUnitRate(bucket.median, extras.unitKind!)}`
      : '';
  return {
    categoryId: category.id,
    categoryLabel: category.label,
    scope,
    n: bucket.n,
    median: bucket.median,
    p25: bucket.p25,
    p75: bucket.p75,
    award: extras.award || value,
    ratio,
    vsMedianPct,
    compareMode,
    note:
      compareMode === 'unit'
        ? `${unitNote} · กลุ่ม「${category.label}」n=${bucket.n} · ${
            scope === 'province' ? 'ระดับจังหวัด' : scope === 'national' ? 'ทั้งประเทศ' : 'ในหน่วยงาน'
          } — ไม่ใช่ราคากลางราชการ`
        : scope === 'national'
          ? `ค่ากลางตลาดจากแคชสัญญาทั่วประเทศ · กลุ่ม「${category.label}」n=${bucket.n} — ไม่ใช่ราคากลางราชการ`
          : scope === 'province'
            ? `ค่ากลางตลาดในจังหวัด · กลุ่ม「${category.label}」n=${bucket.n} — ไม่ใช่ราคากลางราชการ`
            : `ค่ากลางในหน่วยงานนี้ · กลุ่ม「${category.label}」n=${bucket.n} — ไม่ใช่ราคากลางราชการ`,
    ...extras,
  };
}

/** Compare one award against a benchmark bucket (whole contract). */
export function compareToBucket(
  award: number,
  category: { id: WorkCategoryId; label: string },
  bucket: BenchmarkBucket,
  scope: ProjectPriceBenchmark['scope']
): ProjectPriceBenchmark | null {
  return compareValues(award, category, bucket, scope, { compareMode: 'contract', award });
}

export function severityFromVsMedian(vsMedianPct: number): 'High' | 'Medium' | 'Low' {
  const abs = Math.abs(vsMedianPct);
  if (abs >= 40) return 'High';
  if (abs >= 20) return 'Medium';
  return 'Low';
}

export function pctLabel(bm: ProjectPriceBenchmark): string {
  const sign = bm.vsMedianPct >= 0 ? '+' : '';
  return `${sign}${bm.vsMedianPct.toFixed(1)}%`;
}

let cachedNational: PriceBenchmarkFile | null | undefined;

export function loadNationalPriceBenchmarks(): PriceBenchmarkFile | null {
  if (cachedNational !== undefined) return cachedNational;
  try {
    const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'benchmarks');
    const gz = path.join(dir, 'price-by-category.json.gz');
    const json = path.join(dir, 'price-by-category.json');
    if (fs.existsSync(gz)) {
      cachedNational = JSON.parse(zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8'));
    } else if (fs.existsSync(json)) {
      cachedNational = JSON.parse(fs.readFileSync(json, 'utf8'));
    } else {
      cachedNational = null;
    }
  } catch {
    cachedNational = null;
  }
  return cachedNational || null;
}

function pickUnitBucket(
  catEntry: PriceBenchmarkFile['categories'][string] | undefined,
  kind: UnitRateKind,
  province?: string
): { bucket: BenchmarkBucket; scope: ProjectPriceBenchmark['scope'] } | null {
  const u = catEntry?.byUnit?.[kind];
  if (!u) return null;
  if (province && u.byProvince?.[province] && u.byProvince[province].n >= 5) {
    return { bucket: u.byProvince[province], scope: 'province' };
  }
  if (u.n >= 5) return { bucket: u, scope: 'national' };
  return null;
}

function unitKindsToTry(categoryId: string, parsed: ParsedProjectQuantity): UnitRateKind[] {
  const preferred = preferredUnitRateKind(categoryId);
  const available = (Object.keys(parsed.rates) as UnitRateKind[]).filter((k) => parsed.rates[k]);
  const ordered: UnitRateKind[] = [];
  if (preferred && available.includes(preferred)) ordered.push(preferred);
  // for roads, also try m2 as strong secondary
  for (const k of ['baht_per_m2', 'baht_per_km', 'baht_per_m'] as UnitRateKind[]) {
    if (!ordered.includes(k) && available.includes(k)) ordered.push(k);
  }
  return ordered;
}

function quantityLabelFor(kind: UnitRateKind, qty: number): string {
  if (kind === 'baht_per_km') return formatQuantity(qty, 'km');
  if (kind === 'baht_per_m2') return formatQuantity(qty, 'm2');
  return formatQuantity(qty, 'm');
}

/**
 * Prefer unit-rate compare when title has quantity; else whole-contract median.
 * Order: province unit → national unit → province contract → national contract → agency peers.
 */
export function resolveProjectBenchmark(opts: {
  projectName: string;
  award: number;
  province?: string;
  agencyPeerAwardsByCategory?: Partial<Record<WorkCategoryId, number[]>>;
  agencyPeerUnitRatesByCategory?: Partial<Record<WorkCategoryId, Partial<Record<UnitRateKind, number[]>>>>;
}): ProjectPriceBenchmark | null {
  if (!opts.award || opts.award <= 0) return null;
  const cat = categorizeWork(opts.projectName);
  const national = loadNationalPriceBenchmarks();
  const parsed = parseProjectQuantity(opts.projectName);
  const parsedMeta = {
    widthM: parsed.widthM,
    lengthM: parsed.lengthM,
    lengthKm: parsed.lengthKm,
    areaM2: parsed.areaM2,
  };

  for (const kind of unitKindsToTry(cat.id, parsed)) {
    const qty = parsed.rates[kind]?.qty;
    if (!qty) continue;
    const unitRate = unitRateFromAward(opts.award, kind, qty);
    if (!unitRate) continue;

    const nationalHit = pickUnitBucket(national?.categories?.[cat.id], kind, opts.province);
    if (nationalHit) {
      return compareValues(unitRate, cat, nationalHit.bucket, nationalHit.scope, {
        compareMode: 'unit',
        award: opts.award,
        unitKind: kind,
        unitLabel: UNIT_RATE_LABELS[kind],
        quantity: qty,
        quantityLabel: quantityLabelFor(kind, qty),
        unitRate,
        unitRateLabel: formatUnitRate(unitRate, kind),
        parsed: parsedMeta,
      });
    }

    const peerRates = opts.agencyPeerUnitRatesByCategory?.[cat.id]?.[kind] || [];
    const agencyBucket = bucketFromAwards(`${cat.label} · ${UNIT_RATE_LABELS[kind]}`, peerRates);
    if (agencyBucket) {
      return compareValues(unitRate, cat, agencyBucket, 'agency', {
        compareMode: 'unit',
        award: opts.award,
        unitKind: kind,
        unitLabel: UNIT_RATE_LABELS[kind],
        quantity: qty,
        quantityLabel: quantityLabelFor(kind, qty),
        unitRate,
        unitRateLabel: formatUnitRate(unitRate, kind),
        parsed: parsedMeta,
      });
    }
  }

  // Fallback: whole-contract medians
  if (national?.categories?.[cat.id] && opts.province) {
    const prov = national.categories[cat.id].byProvince?.[opts.province];
    if (prov && prov.n >= 5) {
      const hit = compareToBucket(opts.award, cat, prov, 'province');
      if (hit) return { ...hit, parsed: parsedMeta };
    }
  }
  if (national?.categories?.[cat.id] && national.categories[cat.id].n >= 5) {
    const hit = compareToBucket(opts.award, cat, national.categories[cat.id], 'national');
    if (hit) return { ...hit, parsed: parsedMeta };
  }

  const peers = opts.agencyPeerAwardsByCategory?.[cat.id] || [];
  const agencyBucket = bucketFromAwards(cat.label, peers);
  if (agencyBucket) {
    const hit = compareToBucket(opts.award, cat, agencyBucket, 'agency');
    if (hit) return { ...hit, parsed: parsedMeta };
  }

  return null;
}
