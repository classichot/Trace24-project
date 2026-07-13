/** Build a real-agency report primarily from data.go.th / ภาษีไปไหน contracts */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildDatasetFromAnnouncements,
  enrichWithEgpContracts,
  enrichFromAnnouncementPages,
  saveDataset,
} from './lib/ingest.mjs';
import {
  fetchGovSpendingFromDataGoTh,
  govSpendingPortalUrl,
  searchDataGoThPackages,
} from './lib/govspending.mjs';

const AGENCIES = {
  nongyaeng: {
    id: 'nongyaeng',
    th: 'เทศบาลตำบลหนองแหย่ง',
    en: 'Nong Yaeng Subdistrict Municipality',
    prov: 'เชียงใหม่',
    dist: 'สันทราย',
    type: 'อปท. — เทศบาลตำบล',
    tshort: 'เทศบาลตำบล',
    loc: 'อ.สันทราย · จ.เชียงใหม่',
    code: '—',
    web: 'nongyaeng.go.th',
    dataUrl: 'https://www.nongyaeng.go.th/',
    egpKeyword: 'เทศบาลตำบลหนองแหย่ง',
  },
};

const id = process.argv[2] || 'nongyaeng';
const agency = AGENCIES[id];
if (!agency) {
  console.error('Usage: node scripts/build-from-govspending.mjs [nongyaeng]');
  process.exit(1);
}

console.log(`=== Building ${agency.th} from data.go.th / ภาษีไปไหน ===`);
let dataset = buildDatasetFromAnnouncements(agency, []);

const { contracts, discovered } = await fetchGovSpendingFromDataGoTh({
  keyword: agency.egpKeyword,
  maxTotal: 800,
});
console.log(`contracts=${contracts.length}`);
if (contracts.length) {
  dataset = enrichWithEgpContracts(dataset, contracts);
}

dataset.sources = dataset.sources || [];
dataset.sources.push({
  url: 'https://data.go.th',
  type: 'data.go.th CKAN · egp-contact (ภาษีไปไหน)',
  status: contracts.length ? 'ปกติ' : 'ไม่พบใน datastore',
  ok: contracts.length > 0,
  last: 'เพิ่งดึงข้อมูล',
  docs: String(contracts.length),
});
dataset.sources.push({
  url: govSpendingPortalUrl(agency.egpKeyword),
  type: 'ภาษีไปไหน? (govspending portal)',
  status: 'ลิงก์ค้นหาสาธารณะ',
  ok: true,
  last: '—',
  docs: discovered.join(', ') || '—',
});
try {
  const related = await searchDataGoThPackages(agency.egpKeyword, 5);
  if (related.count) {
    dataset.sources.push({
      url: `https://data.go.th/dataset/?q=${encodeURIComponent(agency.egpKeyword)}`,
      type: 'data.go.th package_search',
      status: 'ปกติ',
      ok: true,
      last: 'เพิ่งดึงข้อมูล',
      docs: `${related.count} ชุด`,
    });
  }
} catch {
  /* ignore */
}

dataset = await enrichFromAnnouncementPages(dataset, {
  maxPages: 80,
  concurrency: 4,
  onlyMissing: true,
  mergeContractors: true,
});

dataset.meta.scanSummary = `ข้อมูลจาก data.go.th / ภาษีไปไหน ${contracts.length} สัญญา · เว็บ ${agency.web}`;
dataset.stages = [
  ['ระบุหน่วยงานสำเร็จ', `ยืนยัน ${agency.web}`],
  ['ค้นพบแหล่งข้อมูล', 'data.go.th · ภาษีไปไหน'],
  ['ดึงสัญญา e-GP', `${contracts.length} รายการ`],
  ['สกัดผู้ชนะ/ราคา', 'ประกาศ HTML สำรองเมื่อคอลัมน์เพี้ยน'],
  ['ประมวลกฎความเสี่ยง', 'สัญญาณจากกฎที่อธิบายได้'],
  ['รายงานพร้อมแล้ว', 'ข้อมูลจริงจากแหล่งสาธารณะ'],
];

saveDataset(id, dataset);
console.log('projects', Object.keys(dataset.projects || {}).length, 'contractors', Object.keys(dataset.contractors || {}).length);
