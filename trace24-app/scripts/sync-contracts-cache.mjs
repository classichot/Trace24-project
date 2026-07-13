/**
 * Sync contracts-cache for all agencies in agencies-to-sync.json.
 *
 * Production (Vercel) reads these files — do NOT rely on live CKAN from cloud IPs.
 * Run from a Thailand-reachable network (local PC or self-hosted runner):
 *
 *   npm run sync-contracts-cache
 *   npm run sync-contracts-cache -- --only egp-6501404
 *   npm run sync-contracts-cache -- --dry-run
 *
 * Then commit changed data/contracts-cache/*.json.gz and deploy (CPR).
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { fetchContractsForAgency } from './lib/ckan-contracts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'data', 'contracts-cache');
const LIST_PATH = path.join(CACHE_DIR, 'agencies-to-sync.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyIdx = args.indexOf('--only');
const onlyId = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

if (!fs.existsSync(LIST_PATH)) {
  console.error('Missing', LIST_PATH);
  process.exit(1);
}

const list = JSON.parse(fs.readFileSync(LIST_PATH, 'utf8'));
let agencies = [...(list.agencies || [])].sort((a, b) => (a.priority || 99) - (b.priority || 99));
if (onlyId) agencies = agencies.filter((a) => a.id === onlyId);
if (!agencies.length) {
  console.error('No agencies to sync');
  process.exit(1);
}

fs.mkdirSync(CACHE_DIR, { recursive: true });

const summary = [];
let blocked = false;

console.log(`=== TRACE24 contracts-cache sync (${agencies.length} agencies) ===`);
if (dryRun) console.log('(dry-run — no writes)');

for (const agency of agencies) {
  const label = `${agency.id} · ${agency.th}${agency.prov ? ` · จ.${agency.prov}` : ''}`;
  process.stdout.write(`→ ${label} … `);
  const { rows, errors } = await fetchContractsForAgency(agency.th, {
    prov: agency.prov || '',
    pageSize: 100,
    maxPerResource: 400,
  });

  if (errors.some((e) => /403|IP blocked/i.test(e))) blocked = true;

  if (!rows.length) {
    console.log(`0 rows${errors.length ? ` [${errors.slice(0, 2).join('; ')}]` : ''}`);
    summary.push({ id: agency.id, th: agency.th, count: 0, ok: false, errors: errors.slice(0, 3) });
    continue;
  }

  const payload = {
    agencyId: agency.id,
    keyword: agency.th,
    province: agency.prov || '',
    code: agency.code || '',
    fetchedAt: new Date().toISOString(),
    source: 'egp-contact-2568',
    count: rows.length,
    rows,
  };

  if (!dryRun) {
    const gzPath = path.join(CACHE_DIR, `${agency.id}.json.gz`);
    fs.writeFileSync(gzPath, zlib.gzipSync(JSON.stringify(payload), { level: 9 }));
  }
  console.log(`${rows.length} rows`);
  summary.push({ id: agency.id, th: agency.th, count: rows.length, ok: true });
}

const reportPath = path.join(CACHE_DIR, 'sync-last-run.json');
const report = {
  ranAt: new Date().toISOString(),
  dryRun,
  blockedLikely: blocked,
  ok: summary.filter((s) => s.ok).length,
  failed: summary.filter((s) => !s.ok).length,
  agencies: summary,
};
if (!dryRun) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log('---');
console.log(`ok=${report.ok} failed=${report.failed}`);
if (blocked) {
  console.log(
    'WARNING: data.go.th returned 403 — run this sync from Thailand (local PC / self-hosted runner), not from Vercel or default GitHub-hosted runners.'
  );
  process.exitCode = 2;
}
console.log('Next: commit data/contracts-cache/*.json.gz and deploy (CPR).');
