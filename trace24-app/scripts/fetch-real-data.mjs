import {
  scrapePhothale,
  scrapeNakornnont,
  fetchEgpContracts,
  buildDatasetFromAnnouncements,
  enrichWithEgpContracts,
  saveDataset,
} from './lib/ingest.mjs';

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

  if (apiKey) {
    console.log('Fetching e-GP API contracts...');
    try {
      const contracts = await fetchEgpContracts({
        apiKey,
        keyword: agency.egpKeyword,
        years: [2566, 2567, 2568],
      });
      dataset = enrichWithEgpContracts(dataset, contracts);
      console.log(`Enriched with ${contracts.length} e-GP contracts`);
    } catch (e) {
      console.warn('e-GP API failed:', e.message);
    }
  } else {
    console.log('OPEND_API_KEY not set — using announcement data only');
  }

  saveDataset(id, dataset);
}

console.log('\nDone. Real data cached in data/real/');
