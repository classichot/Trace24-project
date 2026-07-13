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

const target = process.argv[2] || 'all';
const apiKey = process.env.OPEND_API_KEY;

for (const [id, agency] of Object.entries(AGENCIES)) {
  if (target !== 'all' && target !== id) continue;
  console.log(`\n=== Fetching ${agency.th} ===`);
  const rows = await agency.scrape(id === 'phothale' ? 33 : 30);
  let dataset = buildDatasetFromAnnouncements(agency, rows);

  // Primary enrichment: scrape winner/price from e-GP announcement HTML
  dataset = await enrichFromAnnouncementPages(dataset, {
    maxPages: id === 'phothale' ? 150 : 80,
    concurrency: 4,
  });

  if (apiKey) {
    console.log('Trying e-GP Open D API (optional)...');
    try {
      const contracts = await fetchEgpContracts({
        apiKey,
        keyword: agency.egpKeyword,
        years: [2566, 2567, 2568],
      });
      dataset = enrichWithEgpContracts(dataset, contracts);
      console.log(`Enriched with ${contracts.length} e-GP API contracts`);
    } catch (e) {
      console.warn('e-GP API skipped:', e.message);
    }
  }

  saveDataset(id, dataset);
}

console.log('\nDone. Real data cached in data/real/');
