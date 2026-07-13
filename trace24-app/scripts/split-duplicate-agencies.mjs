/**
 * Rebuild catalog keeping every e-GP dept code (no name-dedupe),
 * fill จังหวัด from 7-digit codes, and report name collisions.
 *
 * Prefer: node scripts/build-agency-catalog.mjs  (after name-dedupe fix)
 * This script patches an existing catalog from a fresh CSV download when
 * a full rebuild is heavy — same end state for duplicates.
 *
 * Usage: node scripts/split-duplicate-agencies.mjs
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'data', 'catalog');
const OUT = path.join(DIR, 'agencies.json');
const OUT_GZ = path.join(DIR, 'agencies.json.gz');
const UA = { 'User-Agent': 'TRACE24/1.0 (public-sector research demo)', Accept: '*/*' };

const TH_PROVINCE_BY_CODE = {
  '10': 'กรุงเทพมหานคร',
  '11': 'สมุทรปราการ',
  '12': 'นนทบุรี',
  '13': 'ปทุมธานี',
  '14': 'พระนครศรีอยุธยา',
  '15': 'อ่างทอง',
  '16': 'ลพบุรี',
  '17': 'สิงห์บุรี',
  '18': 'ชัยนาท',
  '19': 'สระบุรี',
  '20': 'ชลบุรี',
  '21': 'ระยอง',
  '22': 'จันทบุรี',
  '23': 'ตราด',
  '24': 'ฉะเชิงเทรา',
  '25': 'ปราจีนบุรี',
  '26': 'นครนายก',
  '27': 'สระแก้ว',
  '30': 'นครราชสีมา',
  '31': 'บุรีรัมย์',
  '32': 'สุรินทร์',
  '33': 'ศรีสะเกษ',
  '34': 'อุบลราชธานี',
  '35': 'ยโสธร',
  '36': 'ชัยภูมิ',
  '37': 'อำนาจเจริญ',
  '38': 'บึงกาฬ',
  '39': 'หนองบัวลำภู',
  '40': 'ขอนแก่น',
  '41': 'อุดรธานี',
  '42': 'เลย',
  '43': 'หนองคาย',
  '44': 'มหาสารคาม',
  '45': 'ร้อยเอ็ด',
  '46': 'กาฬสินธุ์',
  '47': 'สกลนคร',
  '48': 'นครพนม',
  '49': 'มุกดาหาร',
  '50': 'เชียงใหม่',
  '51': 'ลำพูน',
  '52': 'ลำปาง',
  '53': 'อุตรดิตถ์',
  '54': 'แพร่',
  '55': 'น่าน',
  '56': 'พะเยา',
  '57': 'เชียงราย',
  '58': 'แม่ฮ่องสอน',
  '60': 'นครสวรรค์',
  '61': 'อุทัยธานี',
  '62': 'กำแพงเพชร',
  '63': 'ตาก',
  '64': 'สุโขทัย',
  '65': 'พิษณุโลก',
  '66': 'พิจิตร',
  '67': 'เพชรบูรณ์',
  '70': 'ราชบุรี',
  '71': 'กาญจนบุรี',
  '72': 'สุพรรณบุรี',
  '73': 'นครปฐม',
  '74': 'สมุทรสาคร',
  '75': 'สมุทรสงคราม',
  '76': 'เพชรบุรี',
  '77': 'ประจวบคีรีขันธ์',
  '80': 'นครศรีธรรมราช',
  '81': 'กระบี่',
  '82': 'พังงา',
  '83': 'ภูเก็ต',
  '84': 'สุราษฎร์ธานี',
  '85': 'ระนอง',
  '86': 'ชุมพร',
  '90': 'สงขลา',
  '91': 'สตูล',
  '92': 'ตรัง',
  '93': 'พัทลุง',
  '94': 'ปัตตานี',
  '95': 'ยะลา',
  '96': 'นราธิวาส',
};

/** Curated amphoe for known splits */
const DIST_OVERRIDES = {
  '5501408': 'สันทราย',
  '6510407': 'ลี้',
};

const FEATURED_BY_CODE = {
  '5660601': {
    id: 'phothale',
    en: 'Pho Thale Subdistrict Municipality',
    prov: 'พิจิตร',
    dist: 'โพทะเล',
    real: 1,
  },
  '3120101': {
    id: 'nakornnont',
    en: 'Nakhon Nonthaburi City Municipality',
    prov: 'นนทบุรี',
    dist: 'เมือง',
    real: 1,
  },
  '6501402': {
    id: 'nongyaeng',
    en: 'Nong Yaeng Subdistrict Municipality',
    prov: 'เชียงใหม่',
    dist: 'สันทราย',
    real: 1,
  },
};

function provinceFromEgpCode(code) {
  const c = String(code || '').trim();
  if (/^[0-9]{7}$/.test(c)) return TH_PROVINCE_BY_CODE[c.slice(1, 3)] || '';
  if (/^10[0-9]{8}$/.test(c)) return TH_PROVINCE_BY_CODE[c.slice(2, 4)] || '';
  return '';
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

function classifyAgency(th, aff) {
  const name = String(th || '').trim();
  const clean = name.replace(/^\d+\s+/, '');
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
  if (/^กระทรวง|^สำนักงานปลัดกระทรวง/.test(clean)) return { type: 'กระทรวง', tshort: 'กระทรวง' };
  if (/^ทบวง/.test(clean)) return { type: 'ทบวง', tshort: 'ทบวง' };
  if (/^กรม/.test(clean)) return { type: 'กรม', tshort: 'กรม' };
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
  if (/โรงเรียน/.test(clean)) return { type: 'โรงเรียนของรัฐ', tshort: 'โรงเรียน' };
  if (aff === 'ท้องถิ่นรูปแบบพิเศษ') {
    return { type: 'อปท. — รูปแบบพิเศษ', tshort: 'ท้องถิ่นพิเศษ' };
  }
  return { type: aff || 'หน่วยงานจัดซื้อ', tshort: aff || 'หน่วยจัดซื้อ' };
}

async function downloadCsv() {
  const pkgR = await fetch('https://data.go.th/api/3/action/package_show?id=egpdepartment', {
    headers: { ...UA, Accept: 'application/json' },
  });
  const pkg = await pkgR.json();
  if (!pkg.success) throw new Error('package_show failed');
  const res = (pkg.result.resources || []).find((r) => /csv/i.test(r.format) || r.url?.includes('download'));
  if (!res?.url) throw new Error('CSV resource not found');
  console.log('Downloading', res.name || res.url);
  const r = await fetch(res.url, { headers: UA, redirect: 'follow' });
  if (!r.ok) throw new Error(`CSV HTTP ${r.status}`);
  return r.text();
}

console.log('=== Split duplicate agencies (keep every e-GP code) ===');
const csv = await downloadCsv();
const lines = csv.split(/\r?\n/).filter((l) => l.trim());
const header = parseCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, ''));
const iCode = header.indexOf('รหัสหน่วยงาน');
const iName = header.indexOf('ชื่อหน่วยงาน');
const iAff = header.indexOf('สังกัด');
if (iCode < 0 || iName < 0) throw new Error(`Unexpected header: ${header.join(',')}`);

const byType = new Map();
const seenId = new Set();
const seenCode = new Set();
const rows = [];

for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const code = String(cols[iCode] || '').trim();
  const th = String(cols[iName] || '').trim();
  const aff = String(cols[iAff] || '').trim();
  if (!th || !looksThai(th)) continue;
  if (!code || seenCode.has(code)) continue;
  seenCode.add(code);

  const featured = FEATURED_BY_CODE[code];
  let id = featured?.id || codeToId(code);
  if (!id) continue;
  if (seenId.has(id)) id = `${codeToId(code) || id}-${rows.length}`;
  seenId.add(id);

  const { type, tshort } = classifyAgency(th, aff);
  const prov = featured?.prov || provinceFromEgpCode(code) || '';
  const dist = featured?.dist || DIST_OVERRIDES[code] || '';
  rows.push([id, th, code, tshort, type, prov, dist, aff, featured?.real ? 1 : 0]);
  byType.set(tshort, (byType.get(tshort) || 0) + 1);
}

rows.sort((a, b) => {
  if (!!b[8] !== !!a[8]) return a[8] ? -1 : 1;
  return String(a[1]).localeCompare(String(b[1]), 'th') || String(a[5]).localeCompare(String(b[5]), 'th');
});

const nameCounts = new Map();
for (const r of rows) nameCounts.set(r[1], (nameCounts.get(r[1]) || 0) + 1);
const dupNames = [...nameCounts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);

const payload = {
  generatedAt: new Date().toISOString(),
  source: {
    packageId: 'egpdepartment',
    title: 'รายชื่อหน่วยจัดซื้อ (EGP Department)',
    url: 'https://data.go.th/dataset/egpdepartment',
  },
  count: rows.length,
  byType: Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1])),
  fields: ['id', 'th', 'code', 'tshort', 'type', 'prov', 'dist', 'aff', 'real'],
  enrichment: {
    provinceFromEgpCode: true,
    keepDuplicateNames: true,
    duplicateNameCount: dupNames.length,
  },
  rows,
};

fs.mkdirSync(DIR, { recursive: true });
const json = JSON.stringify(payload);
fs.writeFileSync(OUT, json);
fs.writeFileSync(OUT_GZ, zlib.gzipSync(Buffer.from(json), { level: 9 }));
console.log(`saved count=${rows.length} duplicateNames=${dupNames.length}`);
console.log('top duplicate names:');
for (const [name, n] of dupNames.slice(0, 25)) {
  const variants = rows
    .filter((r) => r[1] === name)
    .map((r) => `${r[2]}/${r[5] || '?'}${r[6] ? `·${r[6]}` : ''}`)
    .join(' | ');
  console.log(`  ${n}× ${name} → ${variants}`);
}
const papai = rows.filter((r) => r[1] === 'เทศบาลตำบลป่าไผ่');
console.log(
  'ป่าไผ่',
  papai.map((r) => `${r[0]} จ.${r[5]} อ.${r[6] || '—'}`)
);
