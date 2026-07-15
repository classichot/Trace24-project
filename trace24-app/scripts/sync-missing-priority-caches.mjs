/**
 * Fetch contracts-cache for catalog agencies that are missing (or empty).
 *
 * Default: กรม that have no non-empty cache.
 *
 *   node scripts/sync-missing-priority-caches.mjs
 *   node scripts/sync-missing-priority-caches.mjs --types กรม,กระทรวง,จังหวัด
 *   node scripts/sync-missing-priority-caches.mjs --types กรม --limit 20
 *   node scripts/sync-missing-priority-caches.mjs --concurrency 2
 *   node scripts/sync-missing-priority-caches.mjs --refetch-empty
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { fetchContractsForAgency } from './lib/ckan-contracts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'data', 'contracts-cache');
const CATALOG_GZ = path.join(ROOT, 'data', 'catalog', 'agencies.json.gz');

const args = process.argv.slice(2);
function argVal(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
}

const types = String(argVal('--types', 'กรม'))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const limit = Number(argVal('--limit', '0')) || 0;
const concurrency = Math.max(1, Number(argVal('--concurrency', '2')) || 2);
const refetchEmpty = args.includes('--refetch-empty');
const dryRun = args.includes('--dry-run');

function loadCatalog() {
  if (!fs.existsSync(CATALOG_GZ)) throw new Error('Missing ' + CATALOG_GZ);
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(CATALOG_GZ)).toString('utf8'));
}

function cacheMeta(agencyId) {
  const p = path.join(CACHE_DIR, `${agencyId}.json.gz`);
  if (!fs.existsSync(p)) return null;
  try {
    const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
    return { count: Number(j.count || (j.rows || []).length || 0), path: p };
  } catch {
    return { count: -1, path: p };
  }
}

const cat = loadCatalog();
const typeSet = new Set(types);
/** @type {{id:string,th:string,code:string,tshort:string,prov:string}[]} */
const targets = [];
for (const row of cat.rows || []) {
  const [id, th, code, tshort, , prov] = row;
  if (!typeSet.has(String(tshort))) continue;
  if (!id || !th) continue;
  const meta = cacheMeta(id);
  if (meta && meta.count > 0) continue;
  if (meta && meta.count === 0 && !refetchEmpty) continue;
  targets.push({
    id,
    th: String(th),
    code: String(code || ''),
    tshort: String(tshort),
    prov: String(prov || ''),
  });
}

targets.sort((a, b) => a.th.localeCompare(b.th, 'th'));
const queue = limit > 0 ? targets.slice(0, limit) : targets;

console.log(
  `=== TRACE24 sync missing priority caches ===\ntypes=${types.join(',')} missing=${targets.length} willFetch=${queue.length} concurrency=${concurrency}${dryRun ? ' dry-run' : ''}`
);

if (!queue.length) {
  console.log('Nothing to fetch.');
  process.exit(0);
}

fs.mkdirSync(CACHE_DIR, { recursive: true });

const summary = [];
let idx = 0;
let blocked = false;

async function worker(workerId) {
  while (idx < queue.length) {
    const i = idx++;
    const agency = queue[i];
    const label = `[${i + 1}/${queue.length}] w${workerId} ${agency.id} · ${agency.th}`;
    process.stdout.write(`→ ${label} … `);
    if (dryRun) {
      console.log('skip');
      continue;
    }
    const { rows, errors } = await fetchContractsForAgency(agency.th, {
      prov: '',
      pageSize: 100,
      maxPerResource: 500,
    });
    if (errors.some((e) => /403|IP blocked/i.test(e))) blocked = true;

    const payload = {
      agencyId: agency.id,
      keyword: agency.th,
      province: agency.prov || '',
      code: agency.code || '',
      fetchedAt: new Date().toISOString(),
      source: 'egp-contact-2568',
      count: rows.length,
      rows,
      ...(rows.length
        ? {}
        : {
            note:
              errors.slice(0, 2).join('; ') ||
              'ไม่พบสัญญาภายใต้ชื่อนี้ใน egp-contact-2568',
          }),
    };
    const gzPath = path.join(CACHE_DIR, `${agency.id}.json.gz`);
    fs.writeFileSync(gzPath, zlib.gzipSync(JSON.stringify(payload), { level: 9 }));
    console.log(`${rows.length} rows${errors.length ? ` [${errors.slice(0, 1).join('; ')}]` : ''}`);
    summary.push({
      id: agency.id,
      th: agency.th,
      count: rows.length,
      ok: rows.length > 0,
      errors: errors.slice(0, 3),
    });
  }
}

await Promise.all(Array.from({ length: concurrency }, (_, w) => worker(w + 1)));

const report = {
  ranAt: new Date().toISOString(),
  types,
  blockedLikely: blocked,
  ok: summary.filter((s) => s.ok).length,
  failed: summary.filter((s) => !s.ok).length,
  agencies: summary,
};
const reportPath = path.join(CACHE_DIR, 'sync-missing-priority-last-run.json');
if (!dryRun) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log('---');
console.log(`ok=${report.ok} failed=${report.failed}`);
if (blocked) {
  console.log('WARNING: data.go.th 403 — run from Thailand-reachable network.');
  process.exitCode = 2;
}
console.log('Report:', reportPath);
