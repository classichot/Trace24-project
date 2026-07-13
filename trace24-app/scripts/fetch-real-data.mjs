import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  scrapePhothale,
  scrapeNakornnont,
  fetchEgpContracts,
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

// Load .env.local if present (Node does not load it automatically)
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const AGENCIES = {
  phothale: {
    id: 'phothale',
    th: 'เทศบาลตำบลโพทะเล',
    en: 'Pho Thale Subdistrict Municipality',
    prov: 'พิจิตร',
    dist: 'โพทะเล',
    type: 'อปท. — เทศบาลตำบล',
    tshort: 'เทศบาลตำบล',
    loc: 'อ.โพทะเล · จ.พิจิตร',
    code: '—',
    web: 'phothale.go.th',
    dataUrl: 'https://www.phothale.go.th/egp',
    scrape: scrapePhothale,
    egpKeyword: 'เทศบาลตำบลโพทะเล',
  },
  nakornnont: {
    id: 'nakornnont',
    th: 'เทศบาลนครนนทบุรี',
    en: 'Nakhon Nonthaburi City Municipality',
    prov: 'นนทบุรี',
    dist: 'เมือง',
    type: 'อปท. — เทศบาลนคร',
    tshort: 'เทศบาลนคร',
    loc: 'จ.นนทบุรี',
    code: '—',
    web: 'nakornnont.go.th',
    dataUrl: 'https://procurement.nakornnont.go.th/news_announce',
    scrape: scrapeNakornnont,
    egpKeyword: 'เทศบาลนครนนทบุรี',
  },
};

function markOpenDSource(dataset, { ok, status, docs, last }) {
  dataset.sources = dataset.sources || [];
  const src = dataset.sources.find((s) => /e-GP API|Open D|opend\.data\.go\.th/i.test(s.type + s.url));
  if (src) {
    src.status = status;
    src.ok = ok;
    src.docs = String(docs);
    src.last = last;
  } else {
    dataset.sources.push({
      url: 'opend.data.go.th/govspending/cgdcontract',
      type: 'e-GP Open D API (ราคา/ผู้ชนะ)',
      status,
      ok,
      last,
      docs: String(docs),
    });
  }
}

const target = process.argv[2] || 'all';
const apiKey = process.env.OPEND_API_KEY;

for (const [id, agency] of Object.entries(AGENCIES)) {
  if (target !== 'all' && target !== id) continue;
  console.log(`\n=== Fetching ${agency.th} ===`);
  const rows = await agency.scrape(id === 'phothale' ? 33 : 30);
  let dataset = buildDatasetFromAnnouncements(agency, rows);

  // 1) Try Open D first (short timeout — never hang the pipeline)
  let openDOk = false;
  if (apiKey) {
    console.log('Trying Open D API (timeout-guarded)...');
    try {
      const contracts = await fetchEgpContracts({
        apiKey,
        keyword: agency.egpKeyword,
        years: [2566, 2567, 2568],
        timeoutMs: 8000,
        overallTimeoutMs: 25000,
      });
      if (contracts.length) {
        dataset = enrichWithEgpContracts(dataset, contracts);
        openDOk = true;
        markOpenDSource(dataset, {
          ok: true,
          status: 'ปกติ',
          docs: contracts.length,
          last: 'เพิ่งดึงข้อมูล',
        });
        console.log(`Enriched with ${contracts.length} Open D contracts`);
      } else {
        markOpenDSource(dataset, {
          ok: false,
          status: 'ว่าง — จะใช้ประกาศโดยตรง',
          docs: 0,
          last: '0 contracts',
        });
        console.warn('Open D returned 0 contracts — using announcement fallback');
      }
    } catch (e) {
      markOpenDSource(dataset, {
        ok: false,
        status: 'ล่ม/ช้า — ใช้ประกาศโดยตรง',
        docs: 0,
        last: e.message.slice(0, 80),
      });
      console.warn('Open D skipped:', e.message);
    }
  } else {
    markOpenDSource(dataset, {
      ok: false,
      status: 'ไม่มี OPEND_API_KEY — ใช้ประกาศโดยตรง',
      docs: 0,
      last: '—',
    });
  }

  // 2) Optional data.go.th / ภาษีไปไหน
  console.log('Fetching ภาษีไปไหน / data.go.th e-GP contracts...');
  try {
    const { contracts, discovered } = await fetchGovSpendingFromDataGoTh({
      keyword: agency.egpKeyword,
      maxTotal: id === 'nakornnont' ? 500 : 900,
    });
    if (contracts.length) {
      dataset = enrichWithEgpContracts(dataset, contracts);
      console.log(`Enriched with ${contracts.length} data.go.th contracts`);
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
    } catch (e) {
      console.warn('CKAN package_search skipped:', e.message);
    }
  } catch (e) {
    console.warn('data.go.th / ภาษีไปไหน skipped:', e.message);
  }

  // 3) Announcement HTML extract — official fallback when Open D fails/hangs,
  //    and gap-fill for projects still missing winner/price
  const missing = Object.values(dataset.projects || {}).filter(
    (p) => !p.winner || !p.award || p.award === '—'
  ).length;
  const forceFallback = !openDOk;
  console.log(
    forceFallback
      ? 'Open D unavailable — extracting winners/prices from announcement pages (fallback)...'
      : `Gap-fill from announcements for ${missing} projects still missing price/winner...`
  );
  dataset = await enrichFromAnnouncementPages(dataset, {
    maxPages: id === 'phothale' ? 150 : 80,
    concurrency: 4,
    onlyMissing: !forceFallback,
    mergeContractors: !forceFallback,
  });

  saveDataset(id, dataset);
}

console.log('\nDone. Real data cached in data/real/');
