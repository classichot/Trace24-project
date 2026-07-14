/**
 * Build national market price benchmarks from contracts-cache.
 *
 *   npm run build-price-benchmarks
 *
 * Output: data/benchmarks/price-by-category.json.gz
 * Includes whole-contract medians AND unit rates (บาท/กม., บาท/ม., บาท/ตร.ม.)
 * when titles encode length/area.
 *
 * NOTE: Statistical market medians — NOT official CGD ราคากลาง.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { looksLikeWinnerName } from './lib/egp-contact-row.mjs';
import { parseProjectQuantity, unitRateFromAward } from './lib/parse-project-quantity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'data', 'contracts-cache');
const OUT_DIR = path.join(ROOT, 'data', 'benchmarks');

const UNIT_KINDS = ['baht_per_km', 'baht_per_m', 'baht_per_m2', 'baht_per_piece', 'baht_per_kw'];
const UNIT_LABELS = {
  baht_per_km: 'บาท/กม.',
  baht_per_m: 'บาท/ม.',
  baht_per_m2: 'บาท/ตร.ม.',
  baht_per_piece: 'บาท/หน่วย',
  baht_per_kw: 'บาท/กิโลวัตต์',
};

const CATEGORY_DEFS = [
  { id: 'road_concrete', label: 'ถนนคอนกรีต / คสล.', re: /คสล|คอนกรีตเสริมเหล็ก|ถนนคอนกรีต|ผิวจราจร.*คอนกรีต|คอนกรีตถนน/i },
  { id: 'road_asphalt', label: 'ถนนลาดยาง / แอสฟัลต์', re: /ลาดยาง|แอสฟัลต์|asphalt|overlay|เสริมผิว/i },
  { id: 'drainage', label: 'ระบายน้ำ / ท่อ / บ่อพัก', re: /ระบายน้ำ|ท่อระบาย|บ่อพัก|รางน้ำ|คูคลอง|ท่อเหลี่ยม/i },
  { id: 'water_supply', label: 'ประปา / บาดาล', re: /ประปา|บาดาล|ระบบน้ำ|ถังน้ำ|สถานีสูบ/i },
  { id: 'bridge', label: 'สะพาน / ท่อลอด', re: /สะพาน|ท่อลอด|สะพานลอย/i },
  {
    id: 'electrical',
    label: 'ไฟฟ้า / โซลาร์ / แสงสว่าง',
    re: /โซลาร์|solar|แสงอาทิตย์|rooftop|ระบบผลิตไฟฟ้า|ไฟฟ้า|โคมไฟ|สายไฟฟ้า|หม้อแปลง|ไฟฟ้าส่องสว่าง|ไฟทาง/i,
  },
  {
    id: 'building',
    label: 'อาคาร / ก่อสร้างสิ่งปลูกสร้าง',
    re: /อาคาร|เมรุ|ศาลา|ห้องน้ำ|ศูนย์พัฒนา|ก่อสร้าง.*บ้าน|ปรับปรุงอาคาร|ซ่อมหลังคา|มุงหลังคา|พื้นอาคาร/i,
  },
  { id: 'vehicle', label: 'ยานพาหนะ', re: /รถบรรทุก|รถยนต์|ยานพาหนะ|รถกระบะ|รถขยะ|รถดับเพลิง|จักรยานยนต์/i },
  { id: 'waste', label: 'จัดการขยะ / สิ่งปฏิกูล', re: /ขยะ|สิ่งปฏิกูล|กำจัดขยะ|มูลฝอย/i },
  {
    id: 'it_comms',
    label: 'คอมพิวเตอร์ / สื่อสาร',
    re: /คอมพิวเตอร์|โน้ตบุ๊ก|เซิร์ฟเวอร์|อินเทอร์เน็ต|กล้องวงจรปิด|cctv|ซอฟต์แวร์/i,
  },
  { id: 'medical', label: 'การแพทย์ / เวชภัณฑ์', re: /เวชภัณฑ์|เครื่องมือแพทย์|ยา |วัคซีน|ทันตกรรม|ห้องผ่าตัด/i },
  { id: 'equipment', label: 'ครุภัณฑ์ทั่วไป', re: /ครุภัณฑ์|เครื่องปรับอากาศ|เครื่องถ่ายเอกสาร|เฟอร์นิเจอร์|โต๊ะ|ตู้/i },
];

function categorize(name) {
  for (const def of CATEGORY_DEFS) {
    if (def.re.test(name || '')) return def;
  }
  return { id: 'other', label: 'งานจัดซื้อจัดจ้างอื่น' };
}

function parseMoney(s) {
  const n = Number(String(s || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function bucket(label, awards) {
  const vals = awards.filter((n) => n > 0).sort((a, b) => a - b);
  if (vals.length < 3) return null;
  return {
    label,
    n: vals.length,
    median: Math.round(percentile(vals, 0.5)),
    p25: Math.round(percentile(vals, 0.25)),
    p75: Math.round(percentile(vals, 0.75)),
  };
}

function emptySlot() {
  return {
    awards: [],
    byProv: new Map(),
    byUnit: Object.fromEntries(UNIT_KINDS.map((k) => [k, { rates: [], byProv: new Map() }])),
  };
}

const byCat = new Map();
const labelOf = Object.fromEntries(CATEGORY_DEFS.map((d) => [d.id, d.label]));
labelOf.other = 'งานจัดซื้อจัดจ้างอื่น';

function push(catId, prov, award, unitRates) {
  if (!byCat.has(catId)) byCat.set(catId, emptySlot());
  const slot = byCat.get(catId);
  slot.awards.push(award);
  if (prov) {
    if (!slot.byProv.has(prov)) slot.byProv.set(prov, []);
    slot.byProv.get(prov).push(award);
  }
  for (const [kind, rate] of Object.entries(unitRates || {})) {
    if (!slot.byUnit[kind]) continue;
    slot.byUnit[kind].rates.push(rate);
    if (prov) {
      if (!slot.byUnit[kind].byProv.has(prov)) slot.byUnit[kind].byProv.set(prov, []);
      slot.byUnit[kind].byProv.get(prov).push(rate);
    }
  }
}

console.log('=== TRACE24 build price benchmarks (contract + unit rates) ===');
const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json.gz') && !f.startsWith('.'));
console.log(`files: ${files.length}`);

let rows = 0;
let used = 0;
let withUnit = 0;
const unitHits = Object.fromEntries(UNIT_KINDS.map((k) => [k, 0]));

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  try {
    const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CACHE_DIR, file))).toString('utf8'));
    const prov = String(j.province || '').trim();
    for (const r of j.rows || []) {
      rows++;
      const name = String(r['ชื่อโครงการ'] || '');
      const winner = String(r['ชื่อผู้ชนะ'] || '');
      if (winner && !looksLikeWinnerName(winner)) continue;
      const award = parseMoney(r['ราคาตกลงซื้อ/จ้าง'] || r['งบประมาณ(บาท)']);
      if (!award || award < 1000) continue;
      if (award > 5e9) continue;
      const cat = categorize(name);
      const rowProv = String(r['จังหวัด'] || prov || '').trim();
      const parsed = parseProjectQuantity(name);
      const unitRates = {};
      for (const kind of UNIT_KINDS) {
        const q = parsed.rates?.[kind]?.qty;
        if (!q) continue;
        const rate = unitRateFromAward(award, kind, q);
        if (!rate) continue;
        unitRates[kind] = Math.round(rate);
        unitHits[kind]++;
      }
      if (Object.keys(unitRates).length) withUnit++;
      push(cat.id, rowProv, award, unitRates);
      used++;
    }
  } catch {
    /* skip */
  }
  if ((i + 1) % 1000 === 0) console.log(`  scanned ${i + 1}/${files.length} · used ${used} · withUnit ${withUnit}`);
}

const categories = {};
for (const [id, slot] of byCat) {
  const b = bucket(labelOf[id] || id, slot.awards);
  if (!b) continue;
  const byProvince = {};
  for (const [prov, awards] of slot.byProv) {
    const pb = bucket(labelOf[id] || id, awards);
    if (pb && pb.n >= 5) byProvince[prov] = pb;
  }
  const byUnit = {};
  for (const kind of UNIT_KINDS) {
    const u = slot.byUnit[kind];
    const ub = bucket(`${labelOf[id] || id} · ${UNIT_LABELS[kind]}`, u.rates);
    if (!ub || ub.n < 5) continue;
    const uByProv = {};
    for (const [prov, rates] of u.byProv) {
      const pb = bucket(`${labelOf[id] || id} · ${UNIT_LABELS[kind]}`, rates);
      if (pb && pb.n >= 5) uByProv[prov] = pb;
    }
    byUnit[kind] = {
      ...ub,
      unitLabel: UNIT_LABELS[kind],
      byProvince: uByProv,
    };
  }
  categories[id] = { ...b, byProvince, byUnit };
}

const payload = {
  generatedAt: new Date().toISOString(),
  source: 'contracts-cache egp-contact-2568',
  note:
    'ค่ากลางตลาดเชิงสถิติจากราคาตกลงในแคช — รวมอัตราต่อหน่วย (บาท/กม. ฯลฯ) เมื่อดึงปริมาณจากชื่องานได้ — ไม่ใช่ราคากลางราชการของกรมบัญชีกลาง',
  rowsScanned: rows,
  rowsUsed: used,
  rowsWithUnitRate: withUnit,
  unitHits,
  categories,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const gzPath = path.join(OUT_DIR, 'price-by-category.json.gz');
fs.writeFileSync(gzPath, zlib.gzipSync(JSON.stringify(payload), { level: 6 }));
fs.writeFileSync(
  path.join(OUT_DIR, 'price-by-category.summary.json'),
  JSON.stringify(
    {
      generatedAt: payload.generatedAt,
      rowsUsed: used,
      rowsWithUnitRate: withUnit,
      unitHits,
      categories: Object.fromEntries(
        Object.entries(categories).map(([k, v]) => [
          k,
          {
            label: v.label,
            n: v.n,
            median: v.median,
            p25: v.p25,
            p75: v.p75,
            provinces: Object.keys(v.byProvince || {}).length,
            byUnit: Object.fromEntries(
              Object.entries(v.byUnit || {}).map(([uk, uv]) => [
                uk,
                { n: uv.n, median: uv.median, p25: uv.p25, p75: uv.p75, unitLabel: uv.unitLabel },
              ])
            ),
          },
        ])
      ),
    },
    null,
    2
  )
);

console.log('wrote', gzPath);
console.log('withUnit', withUnit, unitHits);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(categories).map(([k, v]) => [
        k,
        {
          n: v.n,
          median: v.median,
          perKm: v.byUnit?.baht_per_km
            ? { n: v.byUnit.baht_per_km.n, median: v.byUnit.baht_per_km.median }
            : null,
          perM2: v.byUnit?.baht_per_m2
            ? { n: v.byUnit.baht_per_m2.n, median: v.byUnit.baht_per_m2.median }
            : null,
          perPiece: v.byUnit?.baht_per_piece
            ? { n: v.byUnit.baht_per_piece.n, median: v.byUnit.baht_per_piece.median }
            : null,
          perKw: v.byUnit?.baht_per_kw
            ? { n: v.byUnit.baht_per_kw.n, median: v.byUnit.baht_per_kw.median }
            : null,
        },
      ])
    ),
    null,
    2
  )
);
console.log('Done.');
