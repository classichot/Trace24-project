/**
 * Import municipal websites from DLA Open Data CSV → data/catalog/agency-websites.json
 *
 * Source: https://opendata.dla.go.th/dataset/dlads_05_01
 * Column: เว็ปไซต์ของอปท
 *
 * Match strategy (e-GP codes ≠ DLA codes):
 *   1) keep manual overrides
 *   2) name+province (primary)
 *   3) unique name nationwide
 *   4) code / code-prefix (fallback)
 *
 *   node scripts/import-dla-websites.mjs
 *   node scripts/import-dla-websites.mjs --probe-exec --limit 100
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CATALOG_GZ = path.join(ROOT, 'data', 'catalog', 'agencies.json.gz');
const OUT = path.join(ROOT, 'data', 'catalog', 'agency-websites.json');
const CACHE_CSV = path.join(ROOT, 'data', 'catalog', 'dla-org-websites.csv');
const NAKHON_HOSTS = path.join(__dirname, 'data', 'nakhon-hosts.json');

const DLA_CSV_URL =
  'https://opendata.dla.go.th/dataset/1a668c66-c6d6-4c94-bc0f-e57c81813eb8/resource/e9d61e15-d28f-467e-a018-98e0647ef2f4/download/re01_9112566tambon.csv';

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
  '/officers2/executive_information',
  '/officers2/government',
  '/ทำเนียบผู้บริหาร',
  '/คณะผู้บริหาร',
  '/main/executive',
  '/executive',
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
const forceDownload = args.includes('--force-download');
const probeExec = args.includes('--probe-exec');
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 0;
const typesArg = args.includes('--types')
  ? args[args.indexOf('--types') + 1].split(',').map((s) => s.trim())
  : ['เทศบาลนคร', 'เทศบาลเมือง', 'เทศบาลตำบล'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** National / non-municipal hosts that appear as bad DLA data-entry values */
const DENY_HOSTS = new Set([
  'ktb.go.th',
  'bot.go.th',
  'dbd.go.th',
  'dla.go.th',
  'moi.go.th',
  'moph.go.th',
  'cgd.go.th',
  'gprocurement.go.th',
  'revenue.go.th',
  'customs.go.th',
  'police.go.th',
  'nacc.go.th',
  'oag.go.th',
  'mof.go.th',
  'thaigov.go.th',
  'parliament.go.th',
  'prd.go.th',
  'nlc.dla.go.th',
  'info.dla.go.th',
  'opendata.dla.go.th',
]);

function normalizeHost(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  if (!s || /^(-|ไม่มี|N\/A|null|undefined)$/i.test(s)) return '';
  // reject lat/long / bare numbers mistaken as website
  if (/^-?\d+(\.\d+)?$/.test(s)) return '';
  s = s.replace(/^['"]+|['"]+$/g, '');
  try {
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    const u = new URL(s);
    let host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.{2,}/g, '.');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return '';
    if (DENY_HOSTS.has(host)) return '';
    // prefer government / known municipal TLDs
    if (!/\.(go\.th|or\.th|ac\.th|com|net|org|co\.th)$/i.test(host)) return '';
    if (host.includes('..')) return '';
    return host;
  } catch {
    const m = s.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.(?:go\.th|or\.th|ac\.th|com|net|org|co\.th))/i);
    const host = m ? m[1].toLowerCase().replace(/^www\./, '') : '';
    if (!host || DENY_HOSTS.has(host)) return '';
    return host;
  }
}

function normalizeCode(code) {
  const digits = String(code || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/^0+/, '') || digits;
}

function nameCore(th) {
  return String(th || '')
    .replace(/เทศบาลตำบล|เทศบาลเมือง|เทศบาลนคร|เทศบาล/g, '')
    .replace(/องค์การบริหารส่วนตำบล|องค์การบริหารส่วนจังหวัด|อบต\.?|อบจ\.?/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\d+$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

async function ensureCsv() {
  if (!forceDownload && fs.existsSync(CACHE_CSV) && fs.statSync(CACHE_CSV).size > 100_000) {
    console.log('using cached CSV', CACHE_CSV);
    return fs.readFileSync(CACHE_CSV, 'utf8');
  }
  console.log('downloading DLA CSV…');
  const res = await fetch(DLA_CSV_URL, { headers: { 'User-Agent': 'TRACE24/1.0' } });
  if (!res.ok) throw new Error(`DLA CSV HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(CACHE_CSV), { recursive: true });
  fs.writeFileSync(CACHE_CSV, buf);
  console.log('saved', CACHE_CSV, buf.length, 'bytes');
  return buf.toString('utf8');
}

function loadDlaOrgs(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]).map((h) => h.replace(/^\uFEFF/, '').trim());
  const idx = {
    prov: header.findIndex((h) => /จังหวัด/.test(h)),
    code: header.findIndex((h) => /รหัส/.test(h)),
    type: header.findIndex((h) => /ประเภท/.test(h)),
    name: header.findIndex((h) => h === 'อปท.'),
    web: header.findIndex((h) => /ไซต์|website/i.test(h)),
  };
  if (idx.name < 0) idx.name = 5;
  console.log('CSV columns', idx);

  /** @type {Map<string, {code:string,host:string,type:string,nameShort:string,prov:string,fullName:string}>} */
  const byKey = new Map();
  const byCode = new Map();
  const byPrefix = new Map();
  const byNameOnly = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const type = (cols[idx.type] || '').trim();
    if (!/เทศบาล/.test(type)) continue;
    const nameShort = (cols[idx.name] || '').trim();
    const prov = (cols[idx.prov] || '').trim();
    const code = normalizeCode(cols[idx.code]);
    let host = normalizeHost(cols[idx.web]);
    // fallback: scrape host from raw line if quoted commas shifted columns
    if (!host) {
      const m = lines[i].match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.(?:go\.th|or\.th|com|net|org|co\.th))/i);
      if (m) host = normalizeHost(m[1]);
    }
    if (!host || !nameShort) continue;

    const fullName =
      type.includes('นคร')
        ? `เทศบาลนคร${nameShort}`
        : type.includes('เมือง')
          ? `เทศบาลเมือง${nameShort}`
          : `เทศบาลตำบล${nameShort}`;
    const core = nameCore(fullName);
    const org = { code, host, type, nameShort, prov, fullName, core };

    const key = `${prov}||${core}||${type}`;
    if (!byKey.has(key)) byKey.set(key, org);

    if (code) {
      if (!byCode.has(code)) byCode.set(code, org);
      const prefix = code.slice(0, 6);
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
      const arr = byPrefix.get(prefix);
      if (!arr.some((x) => x.host === host && x.core === core)) arr.push(org);
    }

    const nk = `${core}||${type}`;
    if (!byNameOnly.has(nk)) byNameOnly.set(nk, []);
    const narr = byNameOnly.get(nk);
    if (!narr.some((x) => x.host === host && x.prov === prov)) narr.push(org);
  }

  return { byKey, byCode, byPrefix, byNameOnly, count: byKey.size };
}

function loadCatalog() {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(CATALOG_GZ)).toString('utf8'));
  return (j.rows || []).map((r) => ({
    id: r[0],
    th: r[1],
    code: normalizeCode(r[2]),
    tshort: r[3],
    type: r[4],
    prov: r[5] || '',
    dist: r[6] || '',
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

function tshortToDlaType(tshort) {
  if (tshort === 'เทศบาลนคร') return 'เทศบาลนคร';
  if (tshort === 'เทศบาลเมือง') return 'เทศบาลเมือง';
  return 'เทศบาลตำบล';
}

function resolveHost(agency, dla, nakhonMap) {
  if (MANUAL_BY_ID[agency.id]) {
    return { host: MANUAL_BY_ID[agency.id], source: 'manual', note: '' };
  }
  if (nakhonMap[agency.th]) {
    return { host: nakhonMap[agency.th], source: 'curated', note: 'nakhon-hosts.json' };
  }
  const baseName = agency.th.replace(/\d+$/, '').trim();
  if (nakhonMap[baseName]) {
    return { host: nakhonMap[baseName], source: 'curated', note: 'nakhon-hosts.json' };
  }

  const core = nameCore(agency.th);
  const dlaType = tshortToDlaType(agency.tshort);

  if (agency.prov) {
    const hit = dla.byKey.get(`${agency.prov}||${core}||${dlaType}`);
    if (hit?.host) return { host: hit.host, source: 'dla', note: 'name+province', code: hit.code };
  }

  const nameHits = (dla.byNameOnly.get(`${core}||${dlaType}`) || []).filter((x) => x.host);
  if (nameHits.length === 1) {
    return {
      host: nameHits[0].host,
      source: 'dla',
      note: agency.prov ? 'unique name (prov mismatch)' : 'unique name',
      code: nameHits[0].code,
    };
  }
  if (agency.prov && nameHits.length > 1) {
    const sameProv = nameHits.filter((x) => x.prov === agency.prov);
    if (sameProv.length === 1) {
      return { host: sameProv[0].host, source: 'dla', note: 'name+province list', code: sameProv[0].code };
    }
  }

  if (agency.code) {
    const byCode = dla.byCode.get(agency.code);
    // Only accept exact code when the org name also matches (codes drift across systems)
    if (byCode?.host && byCode.core === core) {
      return { host: byCode.host, source: 'dla', note: 'code exact', code: byCode.code };
    }
    const prefixHits = dla.byPrefix.get(agency.code.slice(0, 6)) || [];
    const typed = prefixHits.filter((x) => x.type === dlaType && x.host && x.core === core);
    if (typed.length === 1) {
      return { host: typed[0].host, source: 'dla', note: 'code prefix', code: typed[0].code };
    }
    if (agency.prov) {
      const pp = typed.filter((x) => x.prov === agency.prov);
      if (pp.length === 1) {
        return { host: pp[0].host, source: 'dla', note: 'code prefix+prov', code: pp[0].code };
      }
    }
  }

  return null;
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

async function findExecutivePages(host, agencyName) {
  const pages = new Set();
  for (const o of [`https://www.${host}`, `https://${host}`]) {
    pages.add(`${o}/`);
    for (const p of EXEC_PATHS) pages.add(`${o}${p}`);
  }
  const okPages = [];
  const core = nameCore(agencyName);
  for (const url of [...pages].slice(0, 12)) {
    const got = await fetchHtml(url, 9000);
    if (!got.ok || got.html.length < 600) continue;
    const text = got.html.replace(/<[^>]+>/g, ' ');
    if (core && !text.includes(core) && !text.includes(agencyName)) {
      if (!/(นายกเทศมนตรี|รองนายก|ปลัดเทศบาล)/i.test(text)) continue;
    }
    if (!/(นายกเทศมนตรี|รองนายก|ปลัดเทศบาล|ผู้อำนวยการ|คณะผู้บริหาร|ทำเนียบ)/i.test(text)) continue;
    if (!/(นาย|นางสาว|นาง)\s*[\u0E00-\u0E7F]{2,}/.test(text)) continue;
    okPages.push(got.finalUrl || url);
    if (okPages.length >= 5) break;
  }
  return okPages;
}

function save(packIn) {
  const websites = packIn.websites;
  const withHost = Object.values(websites).filter((w) => w.host).length;
  const withExec = Object.values(websites).filter((w) => w.executivePages?.length).length;
  const bySource = {};
  const byTshort = {};
  for (const w of Object.values(websites)) {
    bySource[w.source || '?'] = (bySource[w.source || '?'] || 0) + 1;
    const t = w.tshort || '?';
    if (!byTshort[t]) byTshort[t] = { n: 0, withHost: 0 };
    byTshort[t].n += 1;
    if (w.host) byTshort[t].withHost += 1;
  }
  const pack = {
    generatedAt: new Date().toISOString(),
    note: 'Municipal website map for TRACE24 — DLA Open Data + curated/manual overrides',
    sourceUrl: DLA_CSV_URL,
    count: Object.keys(websites).length,
    withHost,
    withExec,
    bySource,
    byTshort,
    websites,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(pack, null, 2), 'utf8');
  fs.renameSync(tmp, OUT);
  return pack;
}

const csvText = await ensureCsv();
const dla = loadDlaOrgs(csvText);
const catalog = loadCatalog();
const existing = loadExisting();
const nakhonMap = loadNakhonHosts();

const muniTypes = new Set(typesArg);
let targets = catalog.filter((r) => muniTypes.has(r.tshort) && /เทศบาล/.test(r.th));
targets.sort((a, b) => {
  const ap = a.prov ? 0 : 1;
  const bp = b.prov ? 0 : 1;
  if (ap !== bp) return ap - bp;
  return a.th.localeCompare(b.th, 'th');
});

console.log('=== TRACE24 import DLA websites ===');
console.log({
  dlaOrgsWithHost: dla.count,
  catalogMuni: targets.length,
  types: typesArg.join(','),
});

let matched = 0;
let miss = 0;
const toProbe = [];
const matchNotes = {};

for (const agency of targets) {
  const prior = existing.websites[agency.id];
  const resolved = resolveHost(agency, dla, nakhonMap);

  if (!resolved?.host) {
    miss += 1;
    // Keep only non-DLA priors (manual/curated/bing). Drop stale bad DLA matches.
    if (
      prior?.host &&
      (prior.source === 'manual' ||
        prior.source === 'curated' ||
        prior.source === 'known' ||
        prior.source === 'bing')
    ) {
      existing.websites[agency.id] = prior;
      matched += 1;
      miss -= 1;
      continue;
    }
    existing.websites[agency.id] = {
      host: '',
      home: '',
      executivePages: [],
      name: agency.th,
      tshort: agency.tshort,
      code: agency.code,
      source: 'miss',
      checkedAt: new Date().toISOString(),
      note: 'no website in DLA open data',
    };
    continue;
  }

  matched += 1;
  matchNotes[resolved.note || resolved.source] = (matchNotes[resolved.note || resolved.source] || 0) + 1;

  const entry = {
    host: resolved.host,
    home: prior?.host === resolved.host && prior.home ? prior.home : `https://www.${resolved.host}/`,
    executivePages:
      prior?.host === resolved.host && prior.executivePages?.length ? prior.executivePages : [],
    name: agency.th,
    tshort: agency.tshort,
    code: agency.code,
    source: resolved.source,
    checkedAt: new Date().toISOString(),
  };
  if (resolved.note) entry.note = resolved.note;
  if (resolved.code) entry.dlaCode = resolved.code;
  existing.websites[agency.id] = entry;
  if (probeExec && !entry.executivePages.length) {
    toProbe.push({ id: agency.id, host: entry.host, name: agency.th });
  }
}

if (probeExec) {
  let list = toProbe;
  // prefer นคร/เมือง first
  list.sort((a, b) => {
    const aa = existing.websites[a.id]?.tshort || '';
    const bb = existing.websites[b.id]?.tshort || '';
    const order = { เทศบาลนคร: 0, เทศบาลเมือง: 1, เทศบาลตำบล: 2 };
    return (order[aa] ?? 9) - (order[bb] ?? 9);
  });
  if (limit > 0) list = list.slice(0, limit);
  console.log('probing executive pages for', list.length, 'agencies…');
  let probed = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    try {
      const pages = await findExecutivePages(item.host, item.name);
      if (pages.length) {
        existing.websites[item.id].executivePages = pages;
        probed += 1;
        console.log(`EXEC ${item.id} · ${pages.length} · ${item.host}`);
      } else {
        console.log(`NOEXEC ${item.id} · ${item.host}`);
      }
    } catch (e) {
      console.log(`ERR ${item.id} · ${e.message}`);
    }
    if ((i + 1) % 10 === 0) {
      save(existing);
      await sleep(150);
    }
  }
  console.log('probed ok', probed);
}

const pack = save(existing);
console.log('---');
console.log(
  JSON.stringify(
    {
      matched,
      miss,
      matchNotes,
      total: pack.count,
      withHost: pack.withHost,
      withExec: pack.withExec,
      bySource: pack.bySource,
      out: OUT,
    },
    null,
    2
  )
);
console.log('Done.');
