/**
 * Market price benchmarks from contracts-cache (NOT official CGD ราคากลาง).
 * Categories are inferred from project titles; stats are median / P25–P75 of award prices.
 */
import 'server-only';

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export type WorkCategoryId =
  | 'road_concrete'
  | 'road_asphalt'
  | 'drainage'
  | 'water_supply'
  | 'building'
  | 'bridge'
  | 'vehicle'
  | 'equipment'
  | 'waste'
  | 'electrical'
  | 'it_comms'
  | 'medical'
  | 'other';

export type BenchmarkBucket = {
  label: string;
  n: number;
  median: number;
  p25: number;
  p75: number;
};

export type PriceBenchmarkFile = {
  generatedAt: string;
  source: string;
  note: string;
  categories: Record<string, BenchmarkBucket & { byProvince?: Record<string, BenchmarkBucket> }>;
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
};

const CATEGORY_DEFS: { id: WorkCategoryId; label: string; re: RegExp }[] = [
  { id: 'road_concrete', label: 'ถนนคอนกรีต / คสล.', re: /คสล|คอนกรีตเสริมเหล็ก|ถนนคอนกรีต|ผิวจราจร.*คอนกรีต|คอนกรีตถนน/i },
  { id: 'road_asphalt', label: 'ถนนลาดยาง / แอสฟัลต์', re: /ลาดยาง|แอสฟัลต์|asphalt|overlay|เสริมผิว/i },
  { id: 'drainage', label: 'ระบายน้ำ / ท่อ / บ่อพัก', re: /ระบายน้ำ|ท่อระบาย|บ่อพัก|รางน้ำ|คูคลอง|ท่อเหลี่ยม/i },
  { id: 'water_supply', label: 'ประปา / บาดาล', re: /ประปา|บาดาล|ระบบน้ำ|ถังน้ำ|สถานีสูบ/i },
  { id: 'bridge', label: 'สะพาน / ท่อลอด', re: /สะพาน|ท่อลอด|สะพานลอย/i },
  {
    id: 'building',
    label: 'อาคาร / ก่อสร้างสิ่งปลูกสร้าง',
    re: /อาคาร|เมรุ|ศาลา|ห้องน้ำ|ศูนย์พัฒนา|ก่อสร้าง.*บ้าน|ปรับปรุงอาคาร|หลังคา|พื้นอาคาร/i,
  },
  { id: 'vehicle', label: 'ยานพาหนะ', re: /รถบรรทุก|รถยนต์|ยานพาหนะ|รถกระบะ|รถขยะ|รถดับเพลิง|จักรยานยนต์/i },
  { id: 'waste', label: 'จัดการขยะ / สิ่งปฏิกูล', re: /ขยะ|สิ่งปฏิกูล|กำจัดขยะ|มูลฝอย/i },
  { id: 'electrical', label: 'ไฟฟ้า / แสงสว่าง', re: /ไฟฟ้า|โคมไฟ|สายไฟฟ้า|หม้อแปลง|ไฟฟ้าส่องสว่าง|ไฟทาง/i },
  {
    id: 'it_comms',
    label: 'คอมพิวเตอร์ / สื่อสาร',
    re: /คอมพิวเตอร์|โน้ตบุ๊ก|เซิร์ฟเวอร์|อินเทอร์เน็ต|กล้องวงจรปิด|cctv|ซอฟต์แวร์/i,
  },
  { id: 'medical', label: 'การแพทย์ / เวชภัณฑ์', re: /เวชภัณฑ์|เครื่องมือแพทย์|ยา |วัคซีน|ทันตกรรม|ห้องผ่าตัด/i },
  { id: 'equipment', label: 'ครุภัณฑ์ทั่วไป', re: /ครุภัณฑ์|เครื่องปรับอากาศ|เครื่องถ่ายเอกสาร|เฟอร์นิเจอร์|โต๊ะ|ตู้/i },
];

export function categorizeWork(projectName: string): { id: WorkCategoryId; label: string } {
  const name = String(projectName || '');
  for (const def of CATEGORY_DEFS) {
    if (def.re.test(name)) return { id: def.id, label: def.label };
  }
  return { id: 'other', label: 'งานจัดซื้อจัดจ้างอื่น' };
}

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

/** Compare one award against a benchmark bucket. */
export function compareToBucket(
  award: number,
  category: { id: WorkCategoryId; label: string },
  bucket: BenchmarkBucket,
  scope: ProjectPriceBenchmark['scope']
): ProjectPriceBenchmark | null {
  if (!award || !bucket?.median) return null;
  const ratio = award / bucket.median;
  const vsMedianPct = ((award - bucket.median) / bucket.median) * 100;
  return {
    categoryId: category.id,
    categoryLabel: category.label,
    scope,
    n: bucket.n,
    median: bucket.median,
    p25: bucket.p25,
    p75: bucket.p75,
    award,
    ratio,
    vsMedianPct,
    note:
      scope === 'national'
        ? `ค่ากลางตลาดจากแคชสัญญาทั่วประเทศ · กลุ่ม「${category.label}」n=${bucket.n} — ไม่ใช่ราคากลางราชการ`
        : scope === 'province'
          ? `ค่ากลางตลาดในจังหวัด · กลุ่ม「${category.label}」n=${bucket.n} — ไม่ใช่ราคากลางราชการ`
          : `ค่ากลางในหน่วยงานนี้ · กลุ่ม「${category.label}」n=${bucket.n} — ไม่ใช่ราคากลางราชการ`,
  };
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

/**
 * Pick best available benchmark: province → national → agency peers.
 */
export function resolveProjectBenchmark(opts: {
  projectName: string;
  award: number;
  province?: string;
  agencyPeerAwardsByCategory?: Partial<Record<WorkCategoryId, number[]>>;
}): ProjectPriceBenchmark | null {
  if (!opts.award || opts.award <= 0) return null;
  const cat = categorizeWork(opts.projectName);
  const national = loadNationalPriceBenchmarks();

  if (national?.categories?.[cat.id] && opts.province) {
    const prov = national.categories[cat.id].byProvince?.[opts.province];
    if (prov && prov.n >= 5) {
      const hit = compareToBucket(opts.award, cat, prov, 'province');
      if (hit) return hit;
    }
  }
  if (national?.categories?.[cat.id] && national.categories[cat.id].n >= 5) {
    const hit = compareToBucket(opts.award, cat, national.categories[cat.id], 'national');
    if (hit) return hit;
  }

  const peers = opts.agencyPeerAwardsByCategory?.[cat.id] || [];
  const agencyBucket = bucketFromAwards(cat.label, peers);
  if (agencyBucket) return compareToBucket(opts.award, cat, agencyBucket, 'agency');

  return null;
}
