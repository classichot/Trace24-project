/**
 * Bulk-build contracts-cache for all local-admin agencies from egp-contact CSVs.
 *
 * Streams CSVs to disk-backed buckets (low RAM), then writes
 * data/contracts-cache/{agencyId}.json.gz for every matching อปท.
 *
 *   npm run build-all-contracts-caches
 *   npm run build-all-contracts-caches -- --skip-download
 *   npm run build-all-contracts-caches -- --only-resource 10
 *   npm run build-all-contracts-caches -- --write-caches-only
 *
 * Requires Thailand-reachable network for first download (~5GB total).
 * CSVs are deleted after each successful parse to avoid filling the disk.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import crypto from 'crypto';
import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'data', 'contracts-cache');
const MIRROR_DIR = path.join(ROOT, 'data', 'contracts-mirror');
const BUCKET_DIR = path.join(MIRROR_DIR, 'buckets');
const CATALOG_GZ = path.join(ROOT, 'data', 'catalog', 'agencies.json.gz');

const UA = {
  'User-Agent': 'TRACE24/1.3 (bulk contracts mirror; public-sector research)',
  Accept: '*/*',
};

const LOCAL_SHORT = new Set(['เทศบาลตำบล', 'เทศบาลเมือง', 'เทศบาลนคร', 'อบต.', 'อบจ.']);
const MAX_ROWS_PER_KEY = 300;

const args = process.argv.slice(2);
const skipDownload = args.includes('--skip-download');
const writeCachesOnly = args.includes('--write-caches-only');
const keepCsv = args.includes('--keep-csv');
const limitAgenciesIdx = args.indexOf('--limit-agencies');
const limitAgencies = limitAgenciesIdx >= 0 ? Number(args[limitAgenciesIdx + 1]) : 0;
const onlyResourceIdx = args.indexOf('--only-resource');
const onlyResource = onlyResourceIdx >= 0 ? Number(args[onlyResourceIdx + 1]) : 0;
const clearBuckets = args.includes('--clear-buckets');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
      continue;
    }
    if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function keyHash(key) {
  return crypto.createHash('sha1').update(key).digest('hex');
}

async function listEgContactResources() {
  const r = await fetch('https://data.go.th/api/3/action/package_show?id=egp-contact-2568', {
    headers: { ...UA, Accept: 'application/json' },
  });
  const j = await r.json();
  if (!j.success) throw new Error('package_show egp-contact-2568 failed');
  return (j.result.resources || [])
    .filter((x) => /csv/i.test(x.format || '') || /csv/i.test(x.name || ''))
    .map((x, i) => ({
      index: i + 1,
      id: x.id,
      name: x.name || `resource-${i + 1}`,
      url: x.url,
    }));
}

function loadTargetAgencies() {
  if (!fs.existsSync(CATALOG_GZ)) throw new Error('Missing catalog ' + CATALOG_GZ);
  const cat = JSON.parse(zlib.gunzipSync(fs.readFileSync(CATALOG_GZ)).toString('utf8'));
  /** @type {Map<string, {id:string,th:string,code:string,prov:string}[]>} */
  const byName = new Map();
  for (const row of cat.rows || []) {
    const [id, th, code, tshort, , prov] = row;
    if (!LOCAL_SHORT.has(String(tshort))) continue;
    if (!th) continue;
    const list = byName.get(th) || [];
    list.push({ id, th, code: String(code || ''), prov: String(prov || '') });
    byName.set(th, list);
  }
  if (limitAgencies > 0) {
    const kept = new Map();
    let n = 0;
    for (const [th, list] of byName) {
      kept.set(th, list);
      n += list.length;
      if (n >= limitAgencies) break;
    }
    return { byName: kept, count: n };
  }
  let count = 0;
  for (const list of byName.values()) count += list.length;
  return { byName, count };
}

async function downloadToFile(url, dest, label) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) {
    console.log(`  reuse ${label} (${(fs.statSync(dest).size / 1e6).toFixed(0)} MB)`);
    return dest;
  }
  console.log(`  downloading ${label} …`);
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${label}`);
  if (!res.body) throw new Error('No body');
  const file = createWriteStream(dest);
  await pipeline(Readable.fromWeb(res.body), file);
  console.log(`  saved ${label} (${(fs.statSync(dest).size / 1e6).toFixed(0)} MB)`);
  return dest;
}

function compactRow(row) {
  return {
    รหัสโครงการ: row['รหัสโครงการ'] ?? '',
    ชื่อโครงการ: row['ชื่อโครงการ'] ?? '',
    'งบประมาณ(บาท)': row['งบประมาณ(บาท)'] ?? '',
    'กลุ่มวิธีจัดซื้อฯ': row['กลุ่มวิธีจัดซื้อฯ'] ?? '',
    วิธีจัดซื้อฯ: row['วิธีจัดซื้อฯ'] ?? '',
    ชื่อหน่วยงาน: row['ชื่อหน่วยงาน'] ?? '',
    จังหวัด: row['จังหวัด'] ?? '',
    'เขต/อำเภอ': row['เขต/อำเภอ'] ?? '',
    ปีงบประมาณ: row['ปีงบประมาณ'] ?? '',
    ชื่อผู้ชนะ: row['ชื่อผู้ชนะ'] ?? '',
    เลขนิติบุคคล: row['เลขนิติบุคคล'] ?? '',
    'ราคาตกลงซื้อ/จ้าง': row['ราคาตกลงซื้อ/จ้าง'] ?? '',
    'งบสัญญา(บาท)': row['งบสัญญา(บาท)'] ?? '',
    วันที่ลงนามสัญญา: row['วันที่ลงนามสัญญา'] ?? '',
    วันที่ประกาศ: row['วันที่ประกาศ'] ?? '',
  };
}

console.log('=== TRACE24 bulk contracts-cache builder (disk-backed) ===');
const { byName, count: agencyCount } = loadTargetAgencies();
console.log(`target local-admin agencies: ${agencyCount} (unique names ${byName.size})`);

fs.mkdirSync(MIRROR_DIR, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });
if (clearBuckets && fs.existsSync(BUCKET_DIR)) {
  fs.rmSync(BUCKET_DIR, { recursive: true, force: true });
}
fs.mkdirSync(BUCKET_DIR, { recursive: true });

/** @type {Map<string, number>} */
const counts = new Map();
/** @type {Map<string, string>} hash -> key */
const hashToKey = new Map();
const metaPath = path.join(MIRROR_DIR, 'bucket-keys.json');
if (!clearBuckets && fs.existsSync(metaPath)) {
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    for (const [h, k] of Object.entries(meta.hashToKey || {})) hashToKey.set(h, k);
    for (const [k, c] of Object.entries(meta.counts || {})) counts.set(k, c);
    console.log(`resumed bucket index: ${counts.size} keys`);
  } catch {
    /* ignore */
  }
}

/** @type {Map<string, string[]>} */
const writeBuf = new Map();
const WRITE_BUF_FLUSH = 40;

function flushBucketBuffers() {
  for (const [h, lines] of writeBuf) {
    if (!lines.length) continue;
    fs.appendFileSync(path.join(BUCKET_DIR, `${h}.ndjson`), lines.join(''));
    lines.length = 0;
  }
  writeBuf.clear();
}

function appendBucket(key, rowObj) {
  const c = counts.get(key) || 0;
  if (c >= MAX_ROWS_PER_KEY) return;
  const h = keyHash(key);
  if (!hashToKey.has(h)) hashToKey.set(h, key);
  let lines = writeBuf.get(h);
  if (!lines) {
    lines = [];
    writeBuf.set(h, lines);
  }
  lines.push(JSON.stringify(rowObj) + '\n');
  counts.set(key, c + 1);
  if (lines.length >= WRITE_BUF_FLUSH) {
    fs.appendFileSync(path.join(BUCKET_DIR, `${h}.ndjson`), lines.join(''));
    writeBuf.set(h, []);
  }
}

async function forEachCsvRow(filePath, onRow) {
  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let header = null;
  let n = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (!header) {
      header = cols.map((h) => h.replace(/^"|"$/g, '').trim());
      continue;
    }
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = cols[i] ?? '';
    onRow(obj);
    n++;
    if (n % 100000 === 0) console.log(`    … ${n} rows · keys ${counts.size}`);
  }
  return n;
}

let totalCsvRows = 0;
if (!writeCachesOnly) {
  const resources = await listEgContactResources();
  const useResources = onlyResource
    ? resources.filter((r) => r.index === onlyResource)
    : resources;
  console.log(`resources: ${useResources.length}/${resources.length}`);

  for (const res of useResources) {
    const dest = path.join(MIRROR_DIR, `${String(res.index).padStart(2, '0')}-${res.id.slice(0, 8)}.csv`);
    try {
      if (!skipDownload) await downloadToFile(res.url, dest, res.name);
      else if (!fs.existsSync(dest)) {
        console.warn(`  missing ${dest}`);
        continue;
      }
      console.log(`  parsing ${res.name} …`);
      const n = await forEachCsvRow(dest, (row) => {
        const th = String(row['ชื่อหน่วยงาน'] || '').trim();
        if (!th || !byName.has(th)) return;
        const prov = String(row['จังหวัด'] || '').trim();
        appendBucket(`${th}\t${prov}`, compactRow(row));
      });
      flushBucketBuffers();
      totalCsvRows += n;
      console.log(`  parsed ${n} rows · keys ${counts.size}`);
      // Persist index after each file (crash-safe)
      fs.writeFileSync(
        metaPath,
        JSON.stringify({
          counts: Object.fromEntries(counts),
          hashToKey: Object.fromEntries(hashToKey),
        })
      );
      if (!keepCsv && fs.existsSync(dest)) {
        fs.unlinkSync(dest);
        console.log(`  deleted CSV ${path.basename(dest)} (disk space)`);
      }
    } catch (e) {
      flushBucketBuffers();
      console.error(`  FAIL ${res.name}:`, e.message || e);
    }
  }
} else {
  console.log(`write-caches-only · bucket keys ${counts.size}`);
  if (!counts.size) throw new Error('No bucket index — run full mirror first');
}

function readBucketRows(key) {
  const h = keyHash(key);
  const file = path.join(BUCKET_DIR, `${h}.ndjson`);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return rows;
}

let written = 0;
let skippedEmpty = 0;
const sample = [];

/** @type {Map<string, { prov: string, key: string, count: number }[]>} */
const bucketsByName = new Map();
for (const [key, c] of counts) {
  if (!c) continue;
  const tab = key.indexOf('\t');
  if (tab < 0) continue;
  const th = key.slice(0, tab);
  const prov = key.slice(tab + 1);
  const list = bucketsByName.get(th) || [];
  list.push({ prov, key, count: c });
  bucketsByName.set(th, list);
}

for (const [th, agencies] of byName) {
  const provBuckets = bucketsByName.get(th) || [];
  if (!provBuckets.length) {
    skippedEmpty++;
    continue;
  }

  for (const agency of agencies) {
    let chosen;
    if (agency.prov) {
      chosen = provBuckets.find((b) => b.prov === agency.prov);
      if (!chosen && provBuckets.length === 1) chosen = provBuckets[0];
      if (!chosen) continue;
    } else {
      const sorted = [...provBuckets].sort((a, b) => b.count - a.count);
      chosen = sorted[0];
    }
    const rows = readBucketRows(chosen.key);
    if (!rows.length) continue;

    const payload = {
      agencyId: agency.id,
      keyword: agency.th,
      province: agency.prov || chosen.prov || '',
      code: agency.code,
      fetchedAt: new Date().toISOString(),
      source: 'egp-contact-2568-bulk-mirror',
      count: rows.length,
      rows,
    };
    fs.writeFileSync(
      path.join(CACHE_DIR, `${agency.id}.json.gz`),
      zlib.gzipSync(JSON.stringify(payload), { level: 6 })
    );
    written++;
    if (written % 500 === 0) console.log(`  wrote ${written} caches…`);
    if (sample.length < 25) {
      sample.push({ id: agency.id, th: agency.th, prov: payload.province, count: rows.length });
    }
  }
}

const report = {
  ranAt: new Date().toISOString(),
  csvRowsSeen: totalCsvRows,
  bucketKeys: counts.size,
  agenciesTargeted: agencyCount,
  cachesWritten: written,
  namesWithNoContracts: skippedEmpty,
  maxRowsPerKey: MAX_ROWS_PER_KEY,
  sample,
};
fs.writeFileSync(path.join(CACHE_DIR, 'build-all-last-run.json'), JSON.stringify(report, null, 2));
console.log('---');
console.log(JSON.stringify(report, null, 2));
console.log('Done. Commit data/contracts-cache/*.json.gz then CPR.');
