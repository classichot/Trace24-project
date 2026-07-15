/**
 * Point empty กระทรวง* caches at สำนักงานปลัดกระทรวง* (where contracts live).
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'contracts-cache');
const cat = JSON.parse(
  zlib.gunzipSync(fs.readFileSync(path.join(root, 'data', 'catalog', 'agencies.json.gz'))).toString(
    'utf8'
  )
);

const ministries = [];
const sopBySuffix = new Map(); // "กลาโหม" -> {id, th, count}

for (const row of cat.rows || []) {
  const [id, th, , tshort] = row;
  if (tshort !== 'กระทรวง') continue;
  if (String(th).startsWith('สำนักงานปลัดกระทรวง')) {
    const suffix = String(th).replace(/^สำนักงานปลัดกระทรวง/, '');
    const gz = path.join(dir, `${id}.json.gz`);
    let count = 0;
    if (fs.existsSync(gz)) {
      try {
        const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8'));
        count = Number(j.count || (j.rows || []).length || 0);
      } catch {
        /* ignore */
      }
    }
    const prev = sopBySuffix.get(suffix);
    if (!prev || count > prev.count) sopBySuffix.set(suffix, { id, th: String(th), count });
  } else if (String(th).startsWith('กระทรวง')) {
    ministries.push({ id, th: String(th) });
  }
}

let linked = 0;
for (const m of ministries) {
  const suffix = m.th.replace(/^กระทรวง/, '');
  // catalog naming quirks
  const aliases = [
    suffix,
    suffix.replace(/^การ/, ''),
    // พัฒนาสังคม… vs การพัฒนาสังคม…
    suffix.startsWith('พัฒนา') ? `การ${suffix}` : null,
    suffix.startsWith('การพัฒนา') ? suffix.replace(/^การ/, '') : null,
  ].filter(Boolean);

  let parent = null;
  for (const a of aliases) {
    if (sopBySuffix.has(a)) {
      parent = sopBySuffix.get(a);
      break;
    }
  }
  // fuzzy: parent th ends with same suffix
  if (!parent) {
    for (const [suf, p] of sopBySuffix) {
      if (suffix.includes(suf) || suf.includes(suffix)) {
        parent = p;
        break;
      }
    }
  }

  const gz = path.join(dir, `${m.id}.json.gz`);
  if (!fs.existsSync(gz)) continue;
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8'));
  if ((j.count || 0) > 0) continue;

  if (parent && parent.count > 0) {
    j.parentAgencyId = parent.id;
    j.parentKeyword = parent.th;
    j.note = `สัญญาของกระทรวงอยู่ที่ ${parent.th} (${parent.id})`;
    linked++;
    console.log(`link ${m.id} ${m.th} → ${parent.id} (${parent.count} rows)`);
  } else {
    j.note =
      j.note ||
      'ไม่พบสัญญาภายใต้ชื่อกระทรวงโดยตรงใน egp-contact — ลองสำนักงานปลัดกระทรวงหรือกรมในสังกัด';
    console.log(`no parent ${m.id} ${m.th}`);
  }
  fs.writeFileSync(gz, zlib.gzipSync(JSON.stringify(j), { level: 9 }));
}

// Province empties: clearer note (no e-GP rows under จังหวัด*)
let provinces = 0;
for (const row of cat.rows || []) {
  const [id, th, , tshort] = row;
  if (tshort !== 'จังหวัด') continue;
  const gz = path.join(dir, `${id}.json.gz`);
  if (!fs.existsSync(gz)) continue;
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8'));
  if ((j.count || 0) > 0) continue;
  j.note =
    'ไม่พบสัญญาภายใต้ชื่อจังหวัดใน egp-contact-2568 — สัญญาอยู่ที่ อบจ./เทศบาล/หน่วยงานราชการในพื้นที่';
  fs.writeFileSync(gz, zlib.gzipSync(JSON.stringify(j), { level: 9 }));
  provinces++;
}

console.log(`linked ministries=${linked} province notes=${provinces}`);
