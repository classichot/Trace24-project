/**
 * Build national e-GP buyer catalog from data.go.th `egpdepartment` CSV
 * (รายชื่อหน่วยจัดซื้อ — รหัสหน่วยงาน + ชื่อ + สังกัด).
 *
 * Usage: node scripts/build-agency-catalog.mjs
 * Output: data/catalog/agencies.json
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'catalog');
const OUT = path.join(OUT_DIR, 'agencies.json');
const OUT_GZ = path.join(OUT_DIR, 'agencies.json.gz');
const UA = { 'User-Agent': 'TRACE24/1.0 (public-sector research demo)', Accept: '*/*' };

/** Prefer these stable ids for agencies that already have cached reports */
const FEATURED = {
  เทศบาลตำบลโพทะเล: {
    id: 'phothale',
    en: 'Pho Thale Subdistrict Municipality',
    prov: 'พิจิตร',
    dist: 'โพทะเล',
    web: 'phothale.go.th',
    real: true,
  },
  เทศบาลนครนนทบุรี: {
    id: 'nakornnont',
    en: 'Nakhon Nonthaburi City Municipality',
    prov: 'นนทบุรี',
    dist: 'เมือง',
    web: 'nakornnont.go.th',
    real: true,
  },
  เทศบาลตำบลหนองแหย่ง: {
    id: 'nongyaeng',
    en: 'Nong Yaeng Subdistrict Municipality',
    prov: 'เชียงใหม่',
    dist: 'สันทราย',
    web: 'nongyaeng.go.th',
    real: true,
  },
};

const TYPE_MAP = {
  เทศบาลตำบล: { type: 'อปท. — เทศบาลตำบล', tshort: 'เทศบาลตำบล' },
  เทศบาลเมือง: { type: 'อปท. — เทศบาลเมือง', tshort: 'เทศบาลเมือง' },
  เทศบาลนคร: { type: 'อปท. — เทศบาลนคร', tshort: 'เทศบาลนคร' },
  องค์การบริหารส่วนตำบล: { type: 'อปท. — อบต.', tshort: 'อบต.' },
  องค์การบริหารส่วนจังหวัด: { type: 'อปท. — อบจ.', tshort: 'อบจ.' },
  ท้องถิ่นรูปแบบพิเศษ: { type: 'อปท. — รูปแบบพิเศษ', tshort: 'ท้องถิ่นพิเศษ' },
  ส่วนราชการประเภทสถานศึกษา: { type: 'สถานศึกษา', tshort: 'สถานศึกษา' },
  ส่วนราชการประเภทสถานพยาบาล: { type: 'สถานพยาบาล', tshort: 'สถานพยาบาล' },
  ส่วนราชการทั่วไป: { type: 'ส่วนราชการ', tshort: 'ส่วนราชการ' },
  รัฐวิสาหกิจนอกตลาดหลักทรัพย์: { type: 'รัฐวิสาหกิจ', tshort: 'รัฐวิสาหกิจ' },
  รัฐวิสาหกิจในตลาดหลักทรัพย์: { type: 'รัฐวิสาหกิจ', tshort: 'รัฐวิสาหกิจ' },
  องค์การมหาชน: { type: 'องค์การมหาชน', tshort: 'องค์การมหาชน' },
  องค์กรอิสระตามรัฐธรรมนูญ: { type: 'องค์กรอิสระ', tshort: 'องค์กรอิสระ' },
  หน่วยงานอื่นของรัฐที่จัดตั้งโดยกฎหมายเฉพาะ: { type: 'หน่วยงานของรัฐ', tshort: 'หน่วยงานของรัฐ' },
  'หน่วยงานของรัฐที่ไม่สังกัดสำนักนายกรัฐมนตรี กระทรวงหรือทบวง': {
    type: 'หน่วยงานของรัฐ',
    tshort: 'หน่วยงานของรัฐ',
  },
};

/** Refine type from official name so กระทรวง/กรม/จังหวัด/โรงเรียน/ฯลฯ are searchable as categories. */
function classifyAgency(th, aff) {
  const name = String(th || '').trim();
  const clean = name.replace(/^\d+\s+/, ''); // strip leading school codes

  if (/^เทศบาลนคร/.test(clean) || aff === 'เทศบาลนคร') {
    return { type: 'อปท. — เทศบาลนคร', tshort: 'เทศบาลนคร' };
  }
  if (/^เทศบาลเมือง/.test(clean) || aff === 'เทศบาลเมือง') {
    return { type: 'อปท. — เทศบาลเมือง', tshort: 'เทศบาลเมือง' };
  }
  if (/^เทศบาล/.test(clean) || aff === 'เทศบาลตำบล') {
    return { type: 'อปท. — เทศบาลตำบล', tshort: 'เทศบาลตำบล' };
  }
  if (/^องค์การบริหารส่วนจังหวัด|^อบจ\./.test(clean) || aff === 'องค์การบริหารส่วนจังหวัด') {
    return { type: 'อปท. — อบจ.', tshort: 'อบจ.' };
  }
  if (/^องค์การบริหารส่วนตำบล|^อบต\./.test(clean) || aff === 'องค์การบริหารส่วนตำบล') {
    return { type: 'อปท. — อบต.', tshort: 'อบต.' };
  }
  if (/^กระทรวง|^สำนักงานปลัดกระทรวง/.test(clean)) {
    return { type: 'กระทรวง', tshort: 'กระทรวง' };
  }
  if (/^ทบวง/.test(clean)) {
    return { type: 'ทบวง', tshort: 'ทบวง' };
  }
  if (/^กรม/.test(clean)) {
    return { type: 'กรม', tshort: 'กรม' };
  }
  if (/^จังหวัด|สำนักงานจังหวัด|ศาลากลางจังหวัด/.test(clean)) {
    return { type: 'จังหวัด', tshort: 'จังหวัด' };
  }
  if (/ที่ทำการปกครองอำเภอ|^อำเภอ|สำนักงานอำเภอ|สำนักงานสาธารณสุขอำเภอ/.test(clean)) {
    return { type: 'อำเภอ', tshort: 'อำเภอ' };
  }
  if (/^โรงพยาบาล|โรงพยาบาลส่งเสริมสุขภาพตำบล|^รพ\.สต/.test(clean)) {
    return { type: 'โรงพยาบาลของรัฐ', tshort: 'โรงพยาบาล' };
  }
  if (
    /^มหาวิทยาลัย|ราชภัฏ|ราชมงคล|สถาบันเทคโนโลยีพระจอมเกล้า|สถาบันบัณฑิต/.test(clean) ||
    (/มหาวิทยาลัย/.test(clean) && !/โรงพยาบาล/.test(clean))
  ) {
    return { type: 'มหาวิทยาลัย / อุดมศึกษา', tshort: 'มหาวิทยาลัย' };
  }
  if (/^โรงเรียน|^\d+\s*โรงเรียน/.test(name) || /^โรงเรียน/.test(clean)) {
    return { type: 'โรงเรียนของรัฐ', tshort: 'โรงเรียน' };
  }
  if (/วิทยาลัย/.test(clean) && !/มหาวิทยาลัย/.test(clean)) {
    return { type: 'วิทยาลัย', tshort: 'วิทยาลัย' };
  }
  if (/โรงพยาบาล|รพ\.สต|โรงพยาบาลส่งเสริมสุขภาพตำบล/.test(clean)) {
    return { type: 'โรงพยาบาลของรัฐ', tshort: 'โรงพยาบาล' };
  }
  if (/โรงเรียน/.test(clean)) {
    return { type: 'โรงเรียนของรัฐ', tshort: 'โรงเรียน' };
  }
  if (aff === 'ท้องถิ่นรูปแบบพิเศษ') {
    return { type: 'อปท. — รูปแบบพิเศษ', tshort: 'ท้องถิ่นพิเศษ' };
  }

  return TYPE_MAP[aff] || { type: aff || 'หน่วยงานจัดซื้อ', tshort: aff || 'หน่วยจัดซื้อ' };
}

function looksThai(s) {
  return /[ก-๙]/.test(String(s || ''));
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
      continue;
    }
    if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function codeToId(code) {
  const clean = String(code || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  return clean ? `egp-${clean}` : '';
}

function locLine(prov, dist) {
  if (prov && dist) return `อ.${dist} · จ.${prov}`;
  if (prov) return `จ.${prov}`;
  return '—';
}

async function ckanJson(action, params = {}) {
  const qs = new URLSearchParams(params);
  const r = await fetch(`https://data.go.th/api/3/action/${action}?${qs}`, {
    headers: { ...UA, Accept: 'application/json' },
  });
  const data = await r.json();
  if (!data.success) throw new Error(data?.error?.message || `${action} failed`);
  return data.result;
}

async function downloadEgpDepartmentCsv() {
  const pkg = await ckanJson('package_show', { id: 'egpdepartment' });
  const res = (pkg.resources || []).find((r) => /csv/i.test(r.format) || r.url?.includes('download'));
  if (!res?.url) throw new Error('egpdepartment CSV resource not found');
  console.log('Downloading', res.name || res.url);
  const r = await fetch(res.url, { headers: UA, redirect: 'follow' });
  if (!r.ok) throw new Error(`CSV HTTP ${r.status}`);
  return r.text();
}

/** Optional province enrichment from egpsubdepartment (parent name → จังหวัด) */
async function loadProvinceByName() {
  const map = new Map();
  try {
    const pkg = await ckanJson('package_show', { id: 'egpsubdepartment' });
    const rid = (pkg.resources || []).find((r) => r.datastore_active)?.id;
    if (!rid) return map;
    const page = 1000;
    let offset = 0;
    let total = Infinity;
    while (offset < total && offset < 30000) {
      const qs = new URLSearchParams({
        resource_id: rid,
        limit: String(page),
        offset: String(offset),
        fields: 'ชื่อหน่วยงาน,จังหวัด',
      });
      const r = await fetch(`https://data.go.th/api/3/action/datastore_search?${qs}`, {
        headers: { ...UA, Accept: 'application/json' },
      });
      const data = await r.json();
      if (!data.success) break;
      total = Number(data.result?.total || 0);
      const rows = data.result?.records || [];
      if (!rows.length) break;
      for (const row of rows) {
        const name = String(row['ชื่อหน่วยงาน'] || '').trim();
        const prov = String(row['จังหวัด'] || '').trim();
        if (name && prov && looksThai(name) && !map.has(name)) map.set(name, prov);
      }
      offset += rows.length;
      if (offset % 5000 === 0) console.log(`  province map ${offset}/${total}`);
      await new Promise((x) => setTimeout(x, 40));
    }
  } catch (e) {
    console.warn('province enrichment skipped:', e.message);
  }
  return map;
}

console.log('=== Building e-GP agency catalog ===');
const csv = await downloadEgpDepartmentCsv();
const lines = csv.split(/\r?\n/).filter((l) => l.trim());
const header = parseCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, ''));
const iCode = header.indexOf('รหัสหน่วยงาน');
const iName = header.indexOf('ชื่อหน่วยงาน');
const iAff = header.indexOf('สังกัด');
if (iCode < 0 || iName < 0) throw new Error(`Unexpected header: ${header.join(',')}`);

console.log('Enriching provinces from egpsubdepartment…');
const provByName = await loadProvinceByName();
console.log(`province keys=${provByName.size}`);

const agencies = [];
const seenId = new Set();
const seenName = new Set();
const byType = new Map();

for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const code = String(cols[iCode] || '').trim();
  const th = String(cols[iName] || '').trim();
  const aff = String(cols[iAff] || '').trim();
  if (!th || !looksThai(th)) continue;
  if (seenName.has(th)) continue;
  seenName.add(th);

  const featured = FEATURED[th];
  let id = featured?.id || codeToId(code);
  if (!id) continue;
  if (seenId.has(id)) id = `${id}-${agencies.length}`;
  seenId.add(id);

  const { type, tshort } = classifyAgency(th, aff);
  const prov = featured?.prov || provByName.get(th) || '';
  const dist = featured?.dist || '';
  const row = {
    id,
    th,
    en: featured?.en || '',
    prov,
    dist,
    type,
    tshort,
    loc: locLine(prov, dist),
    code: code || '—',
    web: featured?.web || '',
    aff,
    ...(featured?.real ? { real: true } : {}),
  };
  agencies.push(row);
  byType.set(tshort, (byType.get(tshort) || 0) + 1);
}

agencies.sort((a, b) => {
  if (!!b.real !== !!a.real) return a.real ? -1 : 1;
  return a.th.localeCompare(b.th, 'th');
});

/** Compact rows: [id, th, code, tshort, type, prov, dist, aff, realFlag] */
const rows = agencies.map((a) => [
  a.id,
  a.th,
  a.code,
  a.tshort,
  a.type,
  a.prov || '',
  a.dist || '',
  a.aff || '',
  a.real ? 1 : 0,
]);

const payload = {
  generatedAt: new Date().toISOString(),
  source: {
    packageId: 'egpdepartment',
    title: 'รายชื่อหน่วยจัดซื้อ (EGP Department)',
    url: 'https://data.go.th/dataset/egpdepartment',
  },
  count: agencies.length,
  byType: Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1])),
  fields: ['id', 'th', 'code', 'tshort', 'type', 'prov', 'dist', 'aff', 'real'],
  rows,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify(payload);
fs.writeFileSync(OUT, json);
fs.writeFileSync(OUT_GZ, zlib.gzipSync(Buffer.from(json), { level: 9 }));
const mb = (fs.statSync(OUT).size / (1024 * 1024)).toFixed(2);
const mbGz = (fs.statSync(OUT_GZ).size / (1024 * 1024)).toFixed(2);
console.log(`saved ${OUT} (${mb}MB)`);
console.log(`saved ${OUT_GZ} (${mbGz}MB)`);
console.log(`count=${agencies.length}`);
console.log('byType', payload.byType);
console.log(
  'featured',
  agencies.filter((a) => a.real).map((a) => `${a.id}:${a.code}`)
);
