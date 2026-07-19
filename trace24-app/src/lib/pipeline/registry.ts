import type { SourceRecord } from './types';

/** Public data source registry — owners, URLs, cadence, crawler health */
export const SOURCE_REGISTRY: SourceRecord[] = [
  {
    id: 'src-phothale-egp',
    owner: 'เทศบาลตำบลโพทะเล',
    kind: 'municipal_website',
    url: 'https://www.phothale.go.th/egp',
    updateFrequency: 'daily crawl / on-demand refresh',
    crawlerStatus: 'ok',
    lastAccess: null,
    accessHistory: [],
  },
  {
    id: 'src-nakornnont-proc',
    owner: 'เทศบาลนครนนทบุรี',
    kind: 'procurement_portal',
    url: 'https://procurement.nakornnont.go.th/news_announce',
    updateFrequency: 'daily crawl / on-demand refresh',
    crawlerStatus: 'ok',
    lastAccess: null,
    accessHistory: [],
  },
  {
    id: 'src-opend-cgdcontract',
    owner: 'DGA Open D · govspending/cgdcontract',
    kind: 'api',
    url: 'https://opend.data.go.th/govspending/cgdcontract',
    updateFrequency: 'optional · 8s timeout · fallback to announce HTML',
    crawlerStatus: 'failed',
    lastAccess: null,
    accessHistory: [],
  },
  {
    id: 'src-egp-announce',
    owner: 'กรมบัญชีกลาง · e-GP ShowHTMLFile (สำรอง Open D)',
    kind: 'egp_announce',
    url: 'https://process.gprocurement.go.th/',
    updateFrequency: 'on Open D failure / gap-fill enrich',
    crawlerStatus: 'ok',
    lastAccess: null,
    accessHistory: [],
  },
  {
    id: 'src-data-go-th',
    owner: 'data.go.th · CKAN catalog + datastore',
    kind: 'api',
    url: 'https://data.go.th/api/3',
    updateFrequency: 'on-demand package_search / datastore_search',
    crawlerStatus: 'ok',
    lastAccess: null,
    accessHistory: [],
  },
  {
    id: 'src-govspending',
    owner: 'ภาษีไปไหน? · egp-contact on data.go.th',
    kind: 'api',
    url: 'https://govspending.data.go.th',
    updateFrequency: 'annual CSV packages + datastore filter by agency',
    crawlerStatus: 'ok',
    lastAccess: null,
    accessHistory: [],
  },
  {
    id: 'src-bot-api',
    owner: 'ธปท. · BOT public API',
    kind: 'api',
    url: 'https://apiportal.bot.or.th/bot/public/',
    updateFrequency: 'adjacent · FX / rates (optional token)',
    crawlerStatus: 'planned',
    lastAccess: null,
    accessHistory: [],
  },
  {
    id: 'src-open-dbd',
    owner: 'Open-DBD / ข้อมูลเปิดนิติบุคคล (TIN master)',
    kind: 'dbd',
    url: 'https://data.dbd.go.th/',
    updateFrequency:
      'primary path — seed from contracts-cache TIN → enrich open refs → data/companies/{tin}.json',
    crawlerStatus: 'ok',
    lastAccess: new Date().toISOString().slice(0, 10),
    accessHistory: [
      {
        at: new Date().toISOString(),
        ok: true,
        note: 'Company master keyed by เลขนิติบุคคล — not DBD warehouse scrape',
      },
    ],
  },
  {
    id: 'src-bdex',
    owner: 'BDEX / DBD official API (รายตัว)',
    kind: 'dbd',
    url: 'https://bdex.dbd.go.th/',
    updateFrequency: 'planned — request access for verified per-company pulls',
    crawlerStatus: 'planned',
    lastAccess: null,
    accessHistory: [],
  },
  {
    id: 'src-dbd-warehouse',
    owner: 'DBD DataWarehouse (HTML) — fallback only',
    kind: 'dbd',
    url: 'https://datawarehouse.dbd.go.th/',
    updateFrequency: 'fallback — unstable when site structure changes; do not use as primary',
    crawlerStatus: 'degraded',
    lastAccess: null,
    accessHistory: [],
  },
  {
    id: 'src-budget',
    owner: 'งบประมาณ / ข้อบัญญัติท้องถิ่น',
    kind: 'budget',
    url: '—',
    updateFrequency: 'planned',
    crawlerStatus: 'planned',
    lastAccess: null,
    accessHistory: [],
  },
  {
    id: 'src-audit',
    owner: 'รายงานตรวจสอบ / สตง.',
    kind: 'audit',
    url: '—',
    updateFrequency: 'planned',
    crawlerStatus: 'planned',
    lastAccess: null,
    accessHistory: [],
  },
];

export function listSources(): SourceRecord[] {
  return SOURCE_REGISTRY.map((s) => ({ ...s }));
}

export function touchSource(
  id: string,
  ok: boolean,
  note: string,
  at = new Date().toISOString()
): SourceRecord | null {
  const src = SOURCE_REGISTRY.find((s) => s.id === id);
  if (!src) return null;
  src.lastAccess = at;
  src.crawlerStatus = ok ? 'ok' : 'failed';
  src.accessHistory = [{ at, ok, note }, ...src.accessHistory].slice(0, 20);
  return { ...src, accessHistory: [...src.accessHistory] };
}
