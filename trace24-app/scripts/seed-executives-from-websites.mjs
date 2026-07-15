/**
 * Batch-crawl agency websites for ทำเนียบผู้บริหาร and write data/related/{id}.json
 *
 *   npm run seed-executives -- --only egp-5570801
 *   npm run seed-executives -- --from-known
 *   npm run seed-executives -- --concurrency 2
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const RELATED_DIR = path.join(ROOT, 'data', 'related');
const CACHE_DIR = path.join(ROOT, 'data', 'contracts-cache');

function loadWebsiteFile() {
  const p = path.join(ROOT, 'data', 'catalog', 'agency-websites.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { websites: {} };
  }
}

const WEBSITE_FILE = loadWebsiteFile();
const KNOWN = {
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
for (const [id, e] of Object.entries(WEBSITE_FILE.websites || {})) {
  if (e?.host) KNOWN[id] = e.host;
}

const PATH_HINTS = [
  '/index',
  '',
  '/index.php',
  '/ทำเนียบผู้บริหาร',
  '/ทำเนียบผู้บริหาร.html',
  '/โครงสร้างองค์กร',
  '/โครงสร้าง',
  '/คณะผู้บริหาร',
  '/ผู้บริหาร',
  '/ข้อมูลผู้บริหาร',
  '/officers2/executive_information',
  '/officers2/executive',
  '/officers2/government',
  '/officers2/officepalad',
  '/officers2/divisionoffinance',
  '/officers2/engineeroffice',
  '/officers2/publichealth',
  '/officers2/educationoffice',
  '/officers2/officers2_20',
  '/officers2/concil_member_officer',
  '/web2029/',
  '/web2029/main/executive',
  '/web2029/main/structure',
  '/executive',
  '/about/executive',
  '/personnel',
  '/personnel.php',
  '/personnel.php?id=12',
  '/data.php?id=14',
  '/ita/executive',
  '/data.php?id=3',
  '/index.php?page=executive',
];
const KNOWN_EXEC_PAGES = {
  'egp-5501408': [
    'https://www.paphaichiangmai.go.th/index',
    'https://www.paphaichiangmai.go.th/officers2/executive_information',
    'https://www.paphaichiangmai.go.th/officers2/government',
    'https://www.paphaichiangmai.go.th/officers2/officepalad',
    'https://www.paphaichiangmai.go.th/officers2/divisionoffinance',
    'https://www.paphaichiangmai.go.th/officers2/engineeroffice',
    'https://www.paphaichiangmai.go.th/officers2/publichealth',
    'https://www.paphaichiangmai.go.th/officers2/educationoffice',
    'https://www.paphaichiangmai.go.th/officers2/officers2_20',
    'https://www.paphaichiangmai.go.th/officers2/concil_member_officer',
  ],
  'egp-3340101': [
    'https://www.cityub.go.th/web2029/',
    'https://www.cityub.go.th/web2029/main/executive',
    'https://www.cityub.go.th/web2029/main/structure',
  ],
  'egp-001442300': [
    'https://www.cityub.go.th/web2029/',
    'https://www.cityub.go.th/web2029/main/executive',
    'https://www.cityub.go.th/web2029/main/structure',
  ],
};
for (const [id, e] of Object.entries(WEBSITE_FILE.websites || {})) {
  const pages = [...(e.executivePages || [])];
  if (e.home) pages.unshift(e.home);
  if (pages.length) KNOWN_EXEC_PAGES[id] = [...new Set([...(KNOWN_EXEC_PAGES[id] || []), ...pages])];
}
const LINK_RE = /href\s*=\s*["']([^"']+)["'][^>]*>([^<]{0,120})/gi;
const KEYWORD_RE =
  /ทำเนียบ|ผู้บริหาร|ข้อมูลผู้บริหาร|คณะผู้บริหาร|โครงสร้างองค์กร|หัวหน้าส่วน|นายกเทศมนตรี|ปลัดเทศบาล|กองช่าง|กองคลัง|สำนักปลัด|บุคลากร|personnel|executive|officers2|engineeroffice|divisionoffinance|officepalad|โครงสร้าง/i;

const UA = {
  'User-Agent': 'TRACE24/1.3 (public integrity research; +https://trace24-app.vercel.app)',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'th,en;q=0.8',
};

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const onlyId = onlyIdx >= 0 ? args[onlyIdx + 1] : '';
const fromKnown = args.includes('--from-known');
const concurrencyIdx = args.indexOf('--concurrency');
const concurrency = concurrencyIdx >= 0 ? Number(args[concurrencyIdx + 1]) : 2;

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|tr|td|th|li|h[1-6]|br|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function discoverLinks(html, pageUrl) {
  const found = [];
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(html))) {
    if (!KEYWORD_RE.test(m[1]) && !KEYWORD_RE.test(m[2] || '')) continue;
    try {
      const abs = new URL(m[1], pageUrl).href;
      if (!found.includes(abs)) found.push(abs);
    } catch {
      /* ignore */
    }
  }
  return found.slice(0, 16);
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch(url, { headers: UA, redirect: 'follow', signal: controller.signal });
    const html = await res.text();
    return { ok: res.ok, html: res.ok ? html : '', status: res.status };
  } catch (e) {
    return { ok: false, html: '', status: 0, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeOfficerTitle(raw) {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s.length < 4 || s.length > 72) return false;
  if (looksLikePersonName(s)) return false;
  return /^(นายกเทศมนตรี|รองนายกเทศมนตรี|เลขานุการ|ที่ปรึกษา|ปลัดเทศบาล|รองปลัดเทศบาล|หัวหน้าสำนัก|หัวหน้าส่วน|หัวหน้าฝ่าย|หัวหน้างาน|หัวหน้าหน่วย|ผู้อำนวยการ|นายช่าง|เจ้าพนักงาน|นักวิชาการ|นักจัดการ|นักวิเคราะห์|นักทรัพยากร|เจ้าหน้าที่|พนักงาน|สมาชิกสภา|ประธานสภา|รองประธานสภา|ผู้ช่วยนายก|ผู้ช่วยปลัด)/.test(
    s
  );
}

function looksLikePersonName(raw) {
  const s = raw.replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < 5 || s.length > 56) return false;
  if (/^นายช่าง/.test(s)) return false;
  if (/^นายกเทศมนตรี|^รองนายก|^ปลัดเทศบาล/.test(s)) return false;
  return /^(?:นาย|นางสาว|นาง|ร้อยตำรวจเอก|ร\.ต\.อ\.|ว่าที่(?:\s*ร้อยตรี|\s*ร\.?\s*ต\.?)?)\s*[\u0E00-\u0E7F.]+\s+[\u0E00-\u0E7F.]+$/.test(
    s
  );
}

function pushOfficer(out, name, title, sourceUrl) {
  const n = name.replace(/\s+/g, ' ').trim();
  const t = title.replace(/\s+/g, ' ').trim();
  if (!looksLikePersonName(n) || !looksLikeOfficerTitle(t)) return;
  if (out.some((e) => e.name === n && e.title === t)) return;
  out.push({ name: n, title: t, sourceUrl });
}

function htmlCardExtract(html, sourceUrl) {
  const out = [];
  const re =
    /<(?:div|p|td|span|h[1-6]|li)[^>]*>\s*([^<]{4,80}?)\s*<\/(?:div|p|td|span|h[1-6]|li)>\s*<(?:div|p|td|span|h[1-6]|li)[^>]*>\s*([^<]{3,80}?)\s*<\/(?:div|p|td|span|h[1-6]|li)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const a = m[1].replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    const b = m[2].replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    if (looksLikePersonName(a) && looksLikeOfficerTitle(b)) pushOfficer(out, a, b, sourceUrl);
    if (out.length >= 120) break;
  }
  return out;
}

function htmlBrPairExtract(html, sourceUrl) {
  const out = [];
  const re =
    /((?:นาย|นางสาว|นาง|ร้อยตำรวจเอก|ร\.ต\.อ\.|ว่าที่(?:\s*ร้อยตรี|\s*ร\.?\s*ต\.?)?)\s*[\u0E00-\u0E7F.&nbsp; ]+?)\s*(?:<[^>]+>\s*)*<br\s*\/?>\s*(?:<[^>]+>\s*)*((?:นายกเทศมนตรี|รองนายกเทศมนตรี|เลขานุการ|ที่ปรึกษา|ปลัดเทศบาล|รองปลัดเทศบาล|ผู้อำนวยการ|หัวหน้าสำนัก|หัวหน้าส่วน|นายช่าง|เจ้าพนักงาน|นักวิชาการ|เจ้าหน้าที่)[^<]{0,48})/gi;
  let m;
  while ((m = re.exec(html))) {
    const a = m[1].replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    const b = m[2].replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    if (looksLikePersonName(a) && looksLikeOfficerTitle(b)) pushOfficer(out, a, b, sourceUrl);
    if (out.length >= 120) break;
  }
  return out;
}

function heuristicExtract(text, sourceUrl) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    if (looksLikePersonName(a) && looksLikeOfficerTitle(b)) pushOfficer(out, a, b, sourceUrl);
    if (out.length >= 120) break;
  }
  return out;
}

async function crawlAgency(agencyId, web, keyword) {
  const hosts = [`https://www.${web}/`, `https://${web}/`];
  const urls = new Set(KNOWN_EXEC_PAGES[agencyId] || []);
  for (const base of hosts) {
    for (const p of PATH_HINTS) urls.add(`${base.replace(/\/$/, '')}${p || '/'}`);
  }
  const executives = [];
  const sources = [];
  const discovered = [];
  const knownFirst = [...(KNOWN_EXEC_PAGES[agencyId] || []), ...urls];
  const ordered = [...new Set(knownFirst)];
  for (const url of ordered.slice(0, 22)) {
    const got = await fetchHtml(url);
    sources.push({ url, ok: got.ok, status: got.status });
    if (!got.ok || !got.html) continue;
    discovered.push(...discoverLinks(got.html, url));
    executives.push(...htmlCardExtract(got.html, url));
    executives.push(...htmlBrPairExtract(got.html, url));
    const text = htmlToText(got.html);
    if (text.length < 80) continue;
    executives.push(...heuristicExtract(text, url));
  }
  for (const url of discovered.slice(0, 14)) {
    if (sources.some((s) => s.url === url)) continue;
    const got = await fetchHtml(url);
    sources.push({ url, ok: got.ok, status: got.status });
    if (!got.ok || !got.html) continue;
    executives.push(...htmlCardExtract(got.html, url));
    executives.push(...htmlBrPairExtract(got.html, url));
    const text = htmlToText(got.html);
    if (text.length < 80) continue;
    executives.push(...heuristicExtract(text, url));
  }
  const seen = new Set();
  const deduped = executives.filter((e) => {
    const k = `${e.name}|${e.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { agencyId, keyword, web, executives: deduped, sources };
}

function loadExisting(agencyId) {
  const file = path.join(RELATED_DIR, `${agencyId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function sourceScore(url = '') {
  if (/personnel\.php\?id=12/i.test(url)) return 5; // คณะผู้บริหาร
  if (/officers2\/(engineeroffice|divisionoffinance|officepalad|government)/i.test(url)) return 5;
  if (/personnel\.php\?id=13/i.test(url)) return 4; // สภา
  if (/officers2\//i.test(url)) return 4;
  if (/personnel\.php/i.test(url)) return 3;
  if (/ทำเนียบ|executive/i.test(url)) return 2;
  return 1;
}

/** Drop weak index.php mismatches when a stronger personnel page has the same name. */
function refineExecutives(list) {
  const byName = new Map();
  for (const e of list) {
    const key = e.name;
    const arr = byName.get(key) || [];
    arr.push(e);
    byName.set(key, arr);
  }
  const out = [];
  for (const [, rows] of byName) {
    const bestScore = Math.max(...rows.map((r) => sourceScore(r.sourceUrl)));
    const keep = rows.filter((r) => sourceScore(r.sourceUrl) >= Math.max(2, bestScore - 1));
    // Deduplicate titles; prefer longer title string
    const titles = new Map();
    for (const r of keep.sort((a, b) => sourceScore(b.sourceUrl) - sourceScore(a.sourceUrl))) {
      const t = r.title;
      if (!titles.has(t) || (titles.get(t).title.length < t.length)) titles.set(t, r);
    }
    // If same person has both นายก… and รอง… keep the higher-rank from best source page
    const vals = [...titles.values()];
    const hasMayor = vals.some((v) => /^นายกเทศมนตรี/.test(v.title) && !/^รอง/.test(v.title));
    out.push(
      ...vals.filter((v) => {
        if (hasMayor && v.title === 'รองนายกเทศมนตรี' && sourceScore(v.sourceUrl) < 5) return false;
        return true;
      })
    );
  }
  return out.slice(0, 120);
}

function savePack(agencyId, keyword, web, executives) {
  fs.mkdirSync(RELATED_DIR, { recursive: true });
  const prev = loadExisting(agencyId) || {
    agencyId,
    executives: [],
    companies: [],
  };
  // Replace roster from a fresh crawl (keeps companies); avoids keeping bad title pairs.
  const refined = refineExecutives(executives);
  const pack = {
    ...prev,
    agencyId,
    updatedAt: new Date().toISOString(),
    note: `auto · seed officers (executives+staff) · ${web}`,
    executives: refined,
    companies: prev.companies || [],
  };
  const file = path.join(RELATED_DIR, `${agencyId}.json`);
  fs.writeFileSync(file, JSON.stringify(pack, null, 2), 'utf8');
  return pack;
}

function targets() {
  if (onlyId) {
    const web = KNOWN[onlyId];
    if (!web) {
      console.error(`No known website for ${onlyId} — add to KNOWN in script`);
      process.exit(1);
    }
    return [{ id: onlyId, web, th: onlyId }];
  }
  if (fromKnown) {
    return Object.entries(KNOWN).map(([id, web]) => ({ id, web, th: id }));
  }
  // Default: agencies-to-sync with web field
  const syncPath = path.join(CACHE_DIR, 'agencies-to-sync.json');
  const sync = JSON.parse(fs.readFileSync(syncPath, 'utf8'));
  return (sync.agencies || [])
    .map((a) => ({
      id: a.id,
      web: a.web || KNOWN[a.id] || '',
      th: a.th || a.id,
    }))
    .filter((a) => a.web);
}

async function pool(items, size, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return results;
}

console.log('=== TRACE24 seed executives from websites ===');
const list = targets();
console.log(`targets: ${list.length}`);

const summary = { ok: 0, empty: 0, failed: 0, rows: [] };
await pool(list, concurrency, async (t) => {
  try {
    const r = await crawlAgency(t.id, t.web.replace(/^www\./, ''), t.th);
    if (!r.executives.length) {
      summary.empty++;
      console.log(`  ${t.id} · empty (${t.web})`);
      summary.rows.push({ id: t.id, executives: 0 });
      return;
    }
    const pack = savePack(t.id, t.th, t.web, r.executives);
    summary.ok++;
    console.log(`  ${t.id} · saved ${pack.executives.length} executives`);
    summary.rows.push({ id: t.id, executives: pack.executives.length });
  } catch (e) {
    summary.failed++;
    console.error(`  FAIL ${t.id}:`, e.message || e);
  }
});

fs.writeFileSync(
  path.join(RELATED_DIR, 'seed-executives-last-run.json'),
  JSON.stringify({ ranAt: new Date().toISOString(), ...summary }, null, 2)
);
console.log('---');
console.log(JSON.stringify(summary, null, 2));
console.log('Done.');
