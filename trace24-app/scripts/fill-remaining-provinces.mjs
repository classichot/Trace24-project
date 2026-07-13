import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'data', 'catalog');
const OUT = path.join(DIR, 'agencies.json');
const OUT_GZ = path.join(DIR, 'agencies.json.gz');

const TH = {
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

function prov(c) {
  c = String(c).trim();
  if (/^[0-9]{7}$/.test(c)) return TH[c.slice(1, 3)] || '';
  if (/^10[0-9]{8}$/.test(c)) return TH[c.slice(2, 4)] || '';
  return '';
}

const cat = JSON.parse(zlib.gunzipSync(fs.readFileSync(OUT_GZ)).toString('utf8'));
let filled = 0;
for (const r of cat.rows) {
  if (!r[5]) {
    const p = prov(r[2]);
    if (p) {
      r[5] = p;
      filled++;
    }
  }
}

const nameCounts = new Map();
for (const r of cat.rows) nameCounts.set(r[1], (nameCounts.get(r[1]) || 0) + 1);
const dups = [...nameCounts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
const isLocal = (r) => /เทศบาล|อบต\.|อบจ\./.test(String(r[3]));
const localDupNames = [
  ...new Set(cat.rows.filter((r) => isLocal(r) && (nameCounts.get(r[1]) || 0) > 1).map((r) => r[1])),
].sort((a, b) => a.localeCompare(b, 'th'));

cat.enrichment = {
  ...(cat.enrichment || {}),
  schoolProvinceFill: true,
  filledAfterSchool: filled,
  duplicateNameCount: dups.length,
  localDuplicateNameCount: localDupNames.length,
};
cat.generatedAt = new Date().toISOString();
const json = JSON.stringify(cat);
fs.writeFileSync(OUT, json);
fs.writeFileSync(OUT_GZ, zlib.gzipSync(Buffer.from(json), { level: 9 }));

console.log({
  filled,
  count: cat.rows.length,
  dupNames: dups.length,
  localDupNames: localDupNames.length,
  emptyProv: cat.rows.filter((r) => !r[5]).length,
});
console.log('local duplicates (first 30):');
for (const n of localDupNames.slice(0, 30)) {
  const vs = cat.rows
    .filter((r) => r[1] === n)
    .map((r) => `จ.${r[5] || '?'}(${r[2]})`)
    .join(' | ');
  console.log(`  ${n}: ${vs}`);
}
console.log(
  'ป่าไผ่',
  cat.rows.filter((r) => r[1] === 'เทศบาลตำบลป่าไผ่').map((r) => `${r[2]} จ.${r[5]} อ.${r[6] || '—'}`)
);
