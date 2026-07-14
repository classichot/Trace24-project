/**
 * Repair contracts-cache winner/TIN fields shifted on data.go.th egp-contact.
 *
 *   npm run repair-contracts-winners
 *   npm run repair-contracts-winners -- --only egp-5501408
 *   npm run repair-contracts-winners -- --limit 50
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { normalizeEgpContactRow, looksLikeWinnerName, looksLikeTin } from './lib/egp-contact-row.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'data', 'contracts-cache');

const UA = {
  'User-Agent': 'TRACE24/1.3 (repair winners; public-sector research)',
  Accept: 'application/json',
};

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const onlyId = onlyIdx >= 0 ? args[onlyIdx + 1] : '';
const limitIdx = args.indexOf('--limit');
const limitN = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 0;
const concurrencyIdx = args.indexOf('--concurrency');
const concurrency = concurrencyIdx >= 0 ? Number(args[concurrencyIdx + 1]) : 4;

async function listResources() {
  const r = await fetch('https://data.go.th/api/3/action/package_show?id=egp-contact-2568', {
    headers: UA,
  });
  const j = await r.json();
  if (!j.success) throw new Error('package_show failed');
  return (j.result.resources || [])
    .filter((x) => x.datastore_active || /csv/i.test(x.format || ''))
    .map((x) => x.id);
}

function cacheNeedsRepair(rows) {
  if (!rows?.length) return true;
  let good = 0;
  for (const row of rows.slice(0, 40)) {
    if (looksLikeWinnerName(row['ชื่อผู้ชนะ'])) good++;
  }
  return good < Math.min(3, rows.length);
}

async function fetchAgencyRows(resourceIds, keyword, province, maxRows = 300) {
  const out = [];
  const seen = new Set();
  for (const rid of resourceIds) {
    if (out.length >= maxRows) break;
    const qs = new URLSearchParams({
      resource_id: rid,
      filters: JSON.stringify({ ชื่อหน่วยงาน: keyword }),
      limit: String(Math.min(100, maxRows - out.length)),
      offset: '0',
    });
    try {
      const r = await fetch(`https://data.go.th/api/3/action/datastore_search?${qs}`, {
        headers: UA,
      });
      const j = await r.json();
      if (!j.success) continue;
      for (const raw of j.result.records || []) {
        const n = normalizeEgpContactRow(raw);
        if (province && n['จังหวัด'] && n['จังหวัด'] !== province) continue;
        if (!n['ชื่อโครงการ']) continue;
        const key = `${n['รหัสโครงการ']}|${n['ชื่อผู้ชนะ']}|${n['ราคาตกลงซื้อ/จ้าง']}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(n);
        if (out.length >= maxRows) break;
      }
    } catch {
      /* next resource */
    }
  }
  return out;
}

function listCacheFiles() {
  return fs
    .readdirSync(CACHE_DIR)
    .filter((f) => f.endsWith('.json.gz') && !f.startsWith('.'))
    .map((f) => path.join(CACHE_DIR, f));
}

async function repairOne(file, resourceIds) {
  const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  const agencyId = raw.agencyId || path.basename(file, '.json.gz');
  if (onlyId && agencyId !== onlyId) return { agencyId, skipped: true };
  if (!cacheNeedsRepair(raw.rows)) return { agencyId, skipped: true, reason: 'winners-ok' };

  const keyword = raw.keyword || '';
  const province = raw.province || '';
  if (!keyword) return { agencyId, skipped: true, reason: 'no-keyword' };

  const rows = await fetchAgencyRows(resourceIds, keyword, province, 300);
  const withWinner = rows.filter((r) => looksLikeWinnerName(r['ชื่อผู้ชนะ'])).length;
  if (!rows.length) return { agencyId, ok: false, reason: 'ckan-empty' };

  const payload = {
    ...raw,
    agencyId,
    keyword,
    province,
    fetchedAt: new Date().toISOString(),
    source: 'egp-contact-2568-winner-repair',
    count: rows.length,
    rows,
    repairNote: `normalized shifted columns · winners ${withWinner}/${rows.length}`,
  };
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(payload), { level: 6 }));
  return { agencyId, ok: true, rows: rows.length, winners: withWinner };
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

console.log('=== TRACE24 repair contracts-cache winners ===');
const resources = await listResources();
console.log(`resources: ${resources.length}`);
let files = listCacheFiles();
if (onlyId) files = files.filter((f) => path.basename(f, '.json.gz') === onlyId);
if (limitN > 0) files = files.slice(0, limitN);
console.log(`files: ${files.length}`);

let repaired = 0;
let skipped = 0;
let failed = 0;
const sample = [];

await pool(files, concurrency, async (file, idx) => {
  try {
    const r = await repairOne(file, resources);
    if (r.skipped) skipped++;
    else if (r.ok) {
      repaired++;
      if (sample.length < 15) sample.push(r);
    } else failed++;
    if ((idx + 1) % 50 === 0 || r.ok) {
      console.log(
        `  [${idx + 1}/${files.length}] ${r.agencyId} · ${
          r.skipped ? `skip ${r.reason || ''}` : r.ok ? `ok ${r.winners}/${r.rows}` : r.reason
        }`
      );
    }
  } catch (e) {
    failed++;
    console.error(`  FAIL ${path.basename(file)}:`, e.message || e);
  }
});

const report = {
  ranAt: new Date().toISOString(),
  repaired,
  skipped,
  failed,
  sample,
};
fs.writeFileSync(path.join(CACHE_DIR, 'repair-winners-last-run.json'), JSON.stringify(report, null, 2));
console.log('---');
console.log(JSON.stringify(report, null, 2));
console.log('Done.');
