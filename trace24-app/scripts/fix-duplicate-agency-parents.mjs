/**
 * Link duplicate/alias catalog agencyIds to the canonical contracts-cache.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { fetchContractsForAgency } from './lib/ckan-contracts.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'contracts-cache');

function writeCache(payload) {
  const gz = path.join(dir, `${payload.agencyId}.json.gz`);
  fs.writeFileSync(gz, zlib.gzipSync(JSON.stringify(payload), { level: 9 }));
}

function linkEmpty(id, keyword, parentAgencyId, parentKeyword, note) {
  writeCache({
    agencyId: id,
    keyword,
    fetchedAt: new Date().toISOString(),
    source: 'contracts-cache-alias',
    count: 0,
    rows: [],
    parentAgencyId,
    parentKeyword,
    note,
  });
  console.log(`alias ${id} → ${parentAgencyId}`);
}

// Known catalog duplicates / typos → canonical caches
const aliases = [
  [
    'egp-001441500',
    'เทศบาลนครศรีอยุธยา',
    'egp-3140101',
    'เทศบาลนครพระนครศรีอยุธยา',
  ],
  [
    'egp-001444600',
    'เทศบาลเมืองสุพรรรรบุรี',
    'egp-4720101',
    'เทศบาลเมืองสุพรรณบุรี',
  ],
  ['egp-3062100101', 'องค์การบริหารส่วนจังหวัดกำแพงเพชร  (กีฬา)', 'egp-2620101', 'องค์การบริหารส่วนจังหวัดกำแพงเพชร'],
  ['egp-001455700', 'เทศบาลนครตรัง1', 'egp-3920101', 'เทศบาลนครตรัง'],
  ['egp-001452800', 'เทศบาลนครตรัง2', 'egp-3920101', 'เทศบาลนครตรัง'],
  ['egp-002375000', 'เทศบาลนครตรัง 3', 'egp-3920101', 'เทศบาลนครตรัง'],
  [
    'egp-002374300',
    'เทศบาลเมืองอำนาจเจริญ ชุมชนโคกจักจั่น',
    'egp-4370101',
    'เทศบาลเมืองอำนาจเจริญ',
  ],
];

for (const [id, kw, parentId, parentKw] of aliases) {
  linkEmpty(id, kw, parentId, parentKw, `ชื่อซ้ำ/สะกดผิดในแคตตาล็อก — ใช้สัญญาจาก ${parentKw} (${parentId})`);
}

// Fetch true missing cities (no existing keyword cache)
const toFetch = [
  ['egp-001443800', 'เทศบาลเมืองเชียงราย'],
  ['egp-001240900', 'เทศบาลเมืองบุรีรัมย์'],
  ['egp-001123700', 'เทศบาลเมืองบางบัวทอง'],
  ['egp-001242700', 'เทศบาลเมืองภูเก็ต'],
  ['egp-001444100', 'เทศบาลเมืองสกลนคร'],
  ['egp-001444700', 'เทศบาลเมืองสมุทรสาคร'],
  ['egp-001444200', 'เทศบาลเมืองสุโขทัย'],
  ['egp-001241700', 'เทศบาลเมืองพล'],
  ['egp-5140607', 'เทศบาลเมืองบ้านสร้าง'],
  ['egp-5311001', 'เทศบาลเมืองลำปลายมาศ'],
  ['egp-6800901', 'เทศบาลเมืองชะมาย'],
];

for (const [id, th] of toFetch) {
  process.stdout.write(`fetch ${id} ${th} … `);
  const { rows, errors } = await fetchContractsForAgency(th, {
    pageSize: 100,
    maxPerResource: 400,
  });
  writeCache({
    agencyId: id,
    keyword: th,
    fetchedAt: new Date().toISOString(),
    source: 'egp-contact-2568',
    count: rows.length,
    rows,
    ...(rows.length
      ? {}
      : { note: 'ไม่พบสัญญาภายใต้ชื่อนี้ใน egp-contact-2568' }),
  });
  console.log(`${rows.length} rows${errors[0] ? ` [${errors[0]}]` : ''}`);
}

// Drop leftover empty junk (child centers / schools mis-typed)
const dropIds = [
  'egp-3030100158',
  'egp-3030100151',
  'egp-3030100150',
  'egp-e15082792',
  'egp-e15082816',
  'egp-001485800',
  'egp-001445000',
  'egp-001240400',
  'egp-001240500',
];
for (const id of dropIds) {
  const p = path.join(dir, `${id}.json.gz`);
  if (fs.existsSync(p)) {
    const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
    if ((j.count || 0) === 0 && !j.parentAgencyId) {
      fs.unlinkSync(p);
      console.log('deleted empty', id);
    }
  }
}

console.log('done');
