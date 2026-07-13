/**
 * Fill empty จังหวัด on catalog rows from 7-digit e-GP codes,
 * and restore name-colliding municipalities that build-agency-catalog dropped.
 *
 * Usage: node scripts/enrich-catalog-provinces.mjs
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

function provinceFromCode(code) {
  const c = String(code || '').trim();
  if (!/^[0-9]{7}$/.test(c)) return '';
  return TH_PROVINCE_BY_CODE[c.slice(1, 3)] || '';
}

/** Known duplicate-name municipalities dropped by name-dedupe (code, th, tshort, type, dist, aff) */
const MISSING_BY_CODE = [
  ['6510407', 'เทศบาลตำบลป่าไผ่', 'เทศบาลตำบล', 'อปท. — เทศบาลตำบล', 'ลี้', 'เทศบาลตำบล'],
];

/** Curated district when we know amphoe better than contract labels */
const DIST_OVERRIDES = {
  '5501408': 'สันทราย',
  '6510407': 'ลี้',
};

const raw = fs.existsSync(OUT_GZ)
  ? zlib.gunzipSync(fs.readFileSync(OUT_GZ)).toString('utf8')
  : fs.readFileSync(OUT, 'utf8');
const cat = JSON.parse(raw);

let filled = 0;
const byCode = new Set(cat.rows.map((r) => String(r[2])));

for (const row of cat.rows) {
  const code = String(row[2] || '');
  if (!row[5]) {
    const prov = provinceFromCode(code);
    if (prov) {
      row[5] = prov;
      filled++;
    }
  }
  if (DIST_OVERRIDES[code] && !row[6]) row[6] = DIST_OVERRIDES[code];
}

let added = 0;
for (const [code, th, tshort, type, dist, aff] of MISSING_BY_CODE) {
  if (byCode.has(code)) continue;
  const prov = provinceFromCode(code);
  cat.rows.push([`egp-${code.toLowerCase()}`, th, code, tshort, type, prov, dist, aff, 0]);
  byCode.add(code);
  added++;
}

cat.count = cat.rows.length;
cat.generatedAt = new Date().toISOString();
cat.enrichment = {
  provinceFromEgpCode: true,
  filledProvinces: filled,
  restoredDuplicates: added,
};

const json = JSON.stringify(cat);
fs.writeFileSync(OUT, json);
fs.writeFileSync(OUT_GZ, zlib.gzipSync(Buffer.from(json), { level: 9 }));
console.log(`filled=${filled} added=${added} count=${cat.count}`);
const papai = cat.rows.filter((r) => r[1] === 'เทศบาลตำบลป่าไผ่');
console.log(
  'ป่าไผ่',
  papai.map((r) => `${r[0]} code=${r[2]} จ.${r[5]} อ.${r[6] || '—'}`)
);
