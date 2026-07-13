/**
 * Cache govspending contracts for an agency so Vercel can serve them
 * when data.go.th blocks cloud IPs (HTTP 403).
 *
 * Usage:
 *   node scripts/cache-agency-contracts.mjs "เทศบาลตำบลสนามชัยเขต" egp-5240801
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const RESOURCES = [
  'e4eaa1b4-eb1a-4534-b227-988ee25b898d',
  '9ae119c4-73b9-4bb6-9b71-7b355269bc00',
  '1c1a90af-2d47-4bfb-ae87-e479b2582257',
  'c2385bd6-7e2a-40c2-94d8-6a65824c9415',
  'bb538ac1-3455-446d-b975-d709d6439e72',
  '5b98d6ba-0f66-4bb1-b8db-9b9aae928171',
  '037adcca-b349-44f6-9686-9fd1e9182227',
  '26316135-a95f-40e3-b2e8-1c912046c0ed',
  '882332c4-1f60-4db7-9962-9062eb08f6c4',
  '35961821-d945-4fc0-8ce1-a96b4cd46bd6',
];

const keyword = process.argv[2];
const agencyId = process.argv[3];
if (!keyword || !agencyId) {
  console.error('Usage: node scripts/cache-agency-contracts.mjs "<ชื่อหน่วยงาน>" <agencyId>');
  process.exit(1);
}

const UA = { 'User-Agent': 'TRACE24/1.1', Accept: 'application/json' };
const rows = [];
for (const id of RESOURCES) {
  const qs = new URLSearchParams({
    resource_id: id,
    filters: JSON.stringify({ ชื่อหน่วยงาน: keyword }),
    limit: '100',
  });
  const r = await fetch(`https://data.go.th/api/3/action/datastore_search?${qs}`, { headers: UA });
  const j = await r.json();
  if (!j.success) {
    console.warn('skip', id, j?.error?.message || r.status);
    continue;
  }
  const batch = j.result?.records || [];
  console.log(id.slice(0, 8), batch.length);
  rows.push(...batch);
}

const dir = path.join(root, 'data', 'contracts-cache');
fs.mkdirSync(dir, { recursive: true });
const payload = {
  agencyId,
  keyword,
  fetchedAt: new Date().toISOString(),
  source: 'egp-contact-2568',
  count: rows.length,
  rows,
};
const gzPath = path.join(dir, `${agencyId}.json.gz`);
fs.writeFileSync(gzPath, zlib.gzipSync(JSON.stringify(payload)));
console.log('wrote', gzPath, 'rows', rows.length);
