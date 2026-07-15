import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'contracts-cache');

function patch(id, fields) {
  const p = path.join(dir, `${id}.json.gz`);
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
  Object.assign(j, fields);
  fs.writeFileSync(p, zlib.gzipSync(JSON.stringify(j), { level: 9 }));
  console.log('patched', id);
}

patch('egp-001244000', {
  parentAgencyId: 'egp-2105',
  parentKeyword: 'กรมการแพทย์แผนไทยและการแพทย์ทางเลือก',
  note: 'ชื่อเก่า/ซ้ำในแคตตาล็อก — ใช้สัญญาจาก กรมการแพทย์แผนไทยและการแพทย์ทางเลือก (egp-2105)',
});
patch('egp-001507800', {
  parentAgencyId: 'egp-1434101800',
  parentKeyword: 'มหาวิทยาลัยอุบลราชธานี',
  note: 'ไม่พบสัญญาภายใต้ชื่อนี้ใน egp-contact-2568 — สัญญามักอยู่ที่หน่วยงานแม่ มหาวิทยาลัยอุบลราชธานี (egp-1434101800)',
});
patch('egp-001245800', {
  note: 'ไม่พบสัญญาใน egp-contact-2568 (หน่วยทหาร — อาจไม่เปิดเผยในชุดข้อมูลนี้)',
});
patch('egp-02006', {
  note: 'ไม่พบสัญญาใน egp-contact-2568 (หน่วยทหาร — อาจไม่เปิดเผยในชุดข้อมูลนี้)',
});
patch('egp-0202', {
  note: 'ไม่พบสัญญาใน egp-contact-2568 (อาจใช้ชื่อหน่วยงานอื่นใน e-GP)',
});
patch('egp-0399', {
  note: 'รายการแคตตาล็อกไม่ใช่หน่วยงานจริง (ชื่อสั้นเกินไป)',
});
