/** One-shot: enrich cached agency report from data.go.th / ภาษีไปไหน */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { enrichWithEgpContracts, saveDataset } from './lib/ingest.mjs';
import { fetchGovSpendingFromDataGoTh, govSpendingPortalUrl, searchDataGoThPackages } from './lib/govspending.mjs';

const id = process.argv[2] || 'phothale';
const keywords = {
  phothale: 'เทศบาลตำบลโพทะเล',
  nakornnont: 'เทศบาลนครนนทบุรี',
};
const keyword = keywords[id];
if (!keyword) {
  console.error('Usage: node scripts/enrich-govspending.mjs [phothale|nakornnont]');
  process.exit(1);
}

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), `../data/real/${id}.json`);
const dataset = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(`Loaded ${file} projects=${Object.keys(dataset.projects || {}).length}`);

const { contracts, discovered } = await fetchGovSpendingFromDataGoTh({ keyword, maxTotal: id === 'nakornnont' ? 500 : 900 });
console.log(`contracts=${contracts.length}`);
let next = enrichWithEgpContracts(dataset, contracts);
next.sources = next.sources || [];
const already = new Set(next.sources.map((s) => s.type));
if (!already.has('data.go.th CKAN · egp-contact (ภาษีไปไหน)')) {
  next.sources.push({
    url: 'https://data.go.th',
    type: 'data.go.th CKAN · egp-contact (ภาษีไปไหน)',
    status: contracts.length ? 'ปกติ' : 'ไม่พบใน datastore',
    ok: contracts.length > 0,
    last: 'เพิ่งดึงข้อมูล',
    docs: String(contracts.length),
  });
}
if (!already.has('ภาษีไปไหน? (govspending portal)')) {
  next.sources.push({
    url: govSpendingPortalUrl(keyword),
    type: 'ภาษีไปไหน? (govspending portal)',
    status: 'ลิงก์ค้นหาสาธารณะ',
    ok: true,
    last: '—',
    docs: discovered.join(', ') || '—',
  });
}
try {
  const related = await searchDataGoThPackages(keyword, 5);
  if (related.count && !already.has('data.go.th package_search')) {
    next.sources.push({
      url: `https://data.go.th/dataset/?q=${encodeURIComponent(keyword)}`,
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

saveDataset(id, next);
console.log('contractors', Object.keys(next.contractors || {}).length, 'top', next.topContractors?.slice(0, 3));
