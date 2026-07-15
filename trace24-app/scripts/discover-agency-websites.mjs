/**
 * Discover municipal (.go.th) websites → data/catalog/agency-websites.json
 *
 *   npm run discover-websites -- --types เทศบาลนคร --force
 *   npm run discover-websites -- --types เทศบาลเมือง --concurrency 2
 *   npm run discover-websites -- --types เทศบาลตำบล --cached-only --concurrency 2 --limit 200
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CATALOG_GZ = path.join(ROOT, 'data', 'catalog', 'agencies.json.gz');
const OUT = path.join(ROOT, 'data', 'catalog', 'agency-websites.json');
const CACHE_DIR = path.join(ROOT, 'data', 'contracts-cache');
const NAKHON_HOSTS = path.join(__dirname, 'data', 'nakhon-hosts.json');

const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'th,en;q=0.9',
};

const EXEC_PATHS = [
  '/web2029/main/executive',
  '/web2029/',
  '/index',
  '/index.php',
  '/officers2/executive_information',
  '/officers2/government',
  '/ทำเนียบผู้บริหาร',
  '/คณะผู้บริหาร',
  '/main/executive',
  '/executive',
  '/personnel.php?id=12',
];

const MANUAL_BY_ID = {
  phothale: 'phothale.go.th',
  nakornnont: 'nakornnont.go.th',
  nongyaeng: 'nongyaeng.go.th',
  'egp-5501408': 'paphaichiangmai.go.th',
  'egp-6510407': 'paphai.go.th',
  'egp-6501402': 'nongyaeng.go.th',
  'egp-5570801': 'wiangchiangsaen.go.th',
  'egp-3340101': 'cityub.go.th',
  'egp-001442300': 'cityub.go.th',
};

const args = process.argv.slice(2);
const onlyId = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const typesArg = args.includes('--types')
  ? args[args.indexOf('--types') + 1].split(',').map((s) => s.trim())
  : ['เทศบาลนคร', 'เทศบาลเมือง'];
const cachedOnly = args.includes('--cached-only');
const force = args.includes('--force');
const concurrency = args.includes('--concurrency')
  ? Number(args[args.indexOf('--concurrency') + 1])
  : 2;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 0;
const skipExec = args.includes('--skip-exec');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadCatalogRows() {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(CATALOG_GZ)).toString('utf8'));
  return (j.rows || []).map((r) => ({
    id: r[0],
    th: r[1],
    code: r[2],
    tshort: r[3],
    type: r[4],
    prov: r[5],
    dist: r[6],
  }));
}

function loadExisting() {
  if (!fs.existsSync(OUT)) return { websites: {} };
  try {
    return JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    return { websites: {} };
  }
}

function loadNakhonHosts() {
  try {
    return JSON.parse(fs.readFileSync(NAKHON_HOSTS, 'utf8'));
  } catch {
    return {};
  }
}

function nameCore(th) {
  return String(th || '')
    .replace(/เทศบาลตำบล|เทศบาลเมือง|เทศบาลนคร|เทศบาล/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, '')
    .trim();
}

async function fetchHtml(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: UA, redirect: 'follow', signal: controller.signal });
    const html = await res.text();
    return { ok: res.ok, status: res.status, html, finalUrl: res.url || url };
  } catch (e) {
    return { ok: false, status: 0, html: '', error: e.message, finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}

function pageMentionsAgency(html, agencyName) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  if (/cloudflare|just a moment|enable javascript and cookies/i.test(html.slice(0, 2500))) {
    return false;
  }
  // Strict: page must mention this municipality's own name (avoid false hosts like rangsitcity)
  if (agencyName && text.includes(agencyName)) return true;
  const core = nameCore(agencyName);
  if (core.length >= 3 && text.includes(core)) return true;
  return false;
}

async function probeHost(host, agencyName) {
  // Prefer www; only a few CMS entry paths (keep discovery fast at scale)
  const urls = [
    `https://www.${host}/`,
    `https://www.${host}/web2029/`,
    `https://www.${host}/index`,
    `https://${host}/`,
    `https://www.${host}/2022/`,
  ];
  for (const url of urls) {
    const got = await fetchHtml(url, 7000);
    if (!got.ok || got.html.length < 400) continue;
    if (!pageMentionsAgency(got.html, agencyName)) continue;
    return { home: got.finalUrl || url, html: got.html, host };
  }
  return null;
}

function discoverExecutiveUrls(html, homeUrl) {
  const found = [];
  const re = /href\s*=\s*["']([^"']+)["'][^>]*>([^<]{0,120})/gi;
  let m;
  while ((m = re.exec(html)) && found.length < 24) {
    if (!/ทำเนียบ|ผู้บริหาร|คณะผู้บริหาร|executive|officers2|โครงสร้าง|บุคลากร|ปลัด|กองช่าง|กองคลัง/i.test(`${m[1]} ${m[2] || ''}`)) {
      continue;
    }
    try {
      const abs = new URL(m[1], homeUrl).href;
      if (!found.includes(abs)) found.push(abs);
    } catch {
      /* ignore */
    }
  }
  return found;
}

async function findExecutivePages(host, homeUrl, homeHtml) {
  const pages = new Set(discoverExecutiveUrls(homeHtml || '', homeUrl));
  for (const o of [`https://www.${host}`, `https://${host}`]) {
    for (const p of EXEC_PATHS) pages.add(`${o}${p}`);
  }
  const okPages = [];
  for (const url of [...pages].slice(0, 16)) {
    const got = await fetchHtml(url, 10000);
    if (!got.ok || got.html.length < 800) continue;
    const text = got.html.replace(/<[^>]+>/g, ' ');
    if (!/(นายกเทศมนตรี|รองนายก|ปลัดเทศบาล|ผู้อำนวยการ|คณะผู้บริหาร|ทำเนียบ)/i.test(text)) continue;
    if (!/(นาย|นางสาว|นาง)\s*[\u0E00-\u0E7F]{2,}/.test(text)) continue;
    okPages.push(got.finalUrl || url);
    if (okPages.length >= 6) break;
  }
  return okPages;
}

async function bingHosts(agencyName, prov) {
  const q = prov ? `"${agencyName}" ${prov} เว็บไซต์` : `"${agencyName}" เว็บไซต์ เทศบาล`;
  const url = `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=th`;
  const got = await fetchHtml(url, 16000);
  if (!got.ok) return [];
  const hosts = [
    ...new Set(
      [...got.html.matchAll(/https?:\/\/(?:www\.)?([a-z0-9-]+\.go\.th)/gi)].map((m) =>
        m[1].toLowerCase()
      )
    ),
  ].filter(
    (h) =>
      !/^(google|facebook|youtube|dbd|gprocurement|cgd|dla|moi|moph|data)\./i.test(h) &&
      !/^opendata\.|^gdcatalog\.|^nlc\.dla/i.test(h)
  );
  return hosts.slice(0, 12);
}

function hostCandidates(agency, nakhonMap) {
  const out = [];
  const byId = MANUAL_BY_ID[agency.id];
  if (byId) out.push(byId);
  const byName = nakhonMap[agency.th] || nakhonMap[agency.th.replace(/\s+/g, '')];
  if (byName) out.push(byName);
  // strip numbered duplicates "เทศบาลนครตรัง1"
  const baseName = agency.th.replace(/\d+$/, '').replace(/\s+\d+$/, '').trim();
  if (nakhonMap[baseName]) out.push(nakhonMap[baseName]);
  return [...new Set(out.map((h) => h.replace(/^www\./, '').toLowerCase()))];
}

async function discoverOne(agency, existing, nakhonMap) {
  const prior = existing.websites[agency.id];
  // Never overwrite DLA / manual / curated hosts from a Bing crawl
  if (
    !force &&
    prior?.host &&
    (prior.source === 'dla' ||
      prior.source === 'manual' ||
      prior.source === 'curated' ||
      prior.source === 'known')
  ) {
    return { id: agency.id, skipped: true, entry: prior };
  }
  if (!force && prior?.host && prior.source !== 'miss') {
    return { id: agency.id, skipped: true, entry: prior };
  }

  const tried = new Set();
  const candidates = hostCandidates(agency, nakhonMap);
  const curatedHosts = new Set(candidates);

  // curated / manual first — keep host even if exec pages empty
  for (const host of candidates) {
    tried.add(host);
    const probed = await probeHost(host, agency.th);
    if (!probed) continue;
    const executivePages = skipExec
      ? []
      : await findExecutivePages(host, probed.home, probed.html);
    return {
      id: agency.id,
      entry: {
        host,
        home: probed.home,
        executivePages,
        name: agency.th,
        tshort: agency.tshort,
        source: 'curated',
        checkedAt: new Date().toISOString(),
      },
    };
  }

  // If we have a curated host that failed HTML probe, still record it for manual follow-up
  if (candidates.length) {
    return {
      id: agency.id,
      entry: {
        host: candidates[0],
        home: `https://www.${candidates[0]}/`,
        executivePages: [],
        name: agency.th,
        tshort: agency.tshort,
        source: 'curated-unverified',
        checkedAt: new Date().toISOString(),
        note: 'host curated but page did not confirm name — verify manually',
      },
    };
  }

  // Bing fallback (strict name match inside probeHost)
  await sleep(500 + Math.random() * 500);
  const bing = await bingHosts(agency.th, agency.prov);
  for (const host of bing) {
    if (tried.has(host) || curatedHosts.has(host)) continue;
    tried.add(host);
    const probed = await probeHost(host, agency.th);
    if (!probed) continue;
    const executivePages = skipExec
      ? []
      : await findExecutivePages(host, probed.home, probed.html);
    return {
      id: agency.id,
      entry: {
        host,
        home: probed.home,
        executivePages,
        name: agency.th,
        tshort: agency.tshort,
        source: 'bing',
        checkedAt: new Date().toISOString(),
      },
    };
  }

  return { id: agency.id, entry: null, note: 'no_website' };
}

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return out;
}

function mergeProtectedFromDisk(websites) {
  // Another importer (DLA) may have written a fuller map while this crawl runs.
  // Never clobber dla/manual/curated hosts with a stale in-memory snapshot.
  if (!fs.existsSync(OUT)) return websites;
  let disk;
  try {
    disk = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    return websites;
  }
  const diskWeb = disk.websites || {};
  const out = { ...diskWeb, ...websites };
  for (const [id, entry] of Object.entries(diskWeb)) {
    const src = entry?.source;
    if (
      entry?.host &&
      (src === 'dla' || src === 'manual' || src === 'curated' || src === 'known')
    ) {
      const cur = websites[id];
      if (!cur?.host || cur.source === 'miss' || cur.source === 'bing' || cur.source === 'curated-unverified') {
        out[id] = entry;
      }
    }
  }
  return out;
}

function save(existing) {
  existing.websites = mergeProtectedFromDisk(existing.websites);
  const withHost = Object.values(existing.websites).filter((w) => w.host).length;
  const bySource = {};
  for (const w of Object.values(existing.websites)) {
    bySource[w.source || '?'] = (bySource[w.source || '?'] || 0) + 1;
  }
  const pack = {
    generatedAt: new Date().toISOString(),
    note: 'Municipal website map for TRACE24 — DLA Open Data + discovery crawl',
    count: Object.keys(existing.websites).length,
    withHost,
    bySource,
    websites: existing.websites,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(pack, null, 2), 'utf8');
  fs.renameSync(tmp, OUT);
  return pack;
}

const existing = loadExisting();
const nakhonMap = loadNakhonHosts();
const rows = loadCatalogRows();

let targets;
if (onlyId) {
  const row = rows.find((r) => r.id === onlyId);
  if (!row) {
    console.error('not found', onlyId);
    process.exit(1);
  }
  targets = [row];
} else {
  const cached = new Set(
    fs.existsSync(CACHE_DIR)
      ? fs
          .readdirSync(CACHE_DIR)
          .filter((f) => f.endsWith('.json.gz'))
          .map((f) => f.replace(/\.json\.gz$/, ''))
      : []
  );
  targets = rows.filter((r) => typesArg.includes(r.tshort));
  // skip daycare / junk mis-tagged as เทศบาลนคร
  targets = targets.filter((r) => /เทศบาล/.test(r.th));
  if (cachedOnly) targets = targets.filter((r) => cached.has(r.id));
  targets.sort((a, b) => {
    const am = existing.websites[a.id]?.host ? 1 : 0;
    const bm = existing.websites[b.id]?.host ? 1 : 0;
    if (am !== bm) return am - bm;
    const order = { เทศบาลนคร: 0, เทศบาลเมือง: 1, เทศบาลตำบล: 2 };
    return (order[a.tshort] ?? 9) - (order[b.tshort] ?? 9);
  });
  if (limit > 0) targets = targets.slice(0, limit);
}

console.log('=== TRACE24 discover agency websites ===');
console.log('targets:', targets.length, 'types:', typesArg.join(','), 'concurrency:', concurrency);

let ok = 0;
let miss = 0;
let skipped = 0;

await pool(targets, concurrency, async (agency) => {
  try {
    const result = await discoverOne(agency, existing, nakhonMap);
    if (result.skipped) {
      skipped += 1;
      return;
    }
    if (result.entry) {
      existing.websites[result.id] = result.entry;
      ok += 1;
      console.log(
        `OK ${result.id} · ${result.entry.host} · exec ${result.entry.executivePages?.length || 0} · ${result.entry.source}`
      );
    } else {
      miss += 1;
      existing.websites[result.id] = {
        host: '',
        home: '',
        executivePages: [],
        name: agency.th,
        tshort: agency.tshort,
        source: 'miss',
        checkedAt: new Date().toISOString(),
        note: result.note || 'not_found',
      };
      console.log(`MISS ${result.id} · ${agency.th}`);
    }
  } catch (e) {
    miss += 1;
    console.log(`ERR ${agency.id} · ${e.message}`);
  }
  if ((ok + miss) % 5 === 0) save(existing);
});

const pack = save(existing);
console.log('---');
console.log(JSON.stringify({ ok, miss, skipped, total: pack.count, withHost: pack.withHost, out: OUT }, null, 2));
console.log('Done.');
