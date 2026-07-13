/**
 * Cache govspending contracts for one agency (Vercel-safe offline copy).
 *
 * Usage:
 *   node scripts/cache-agency-contracts.mjs "เทศบาลตำบลสนามชัยเขต" egp-5240801
 *   node scripts/cache-agency-contracts.mjs "เทศบาลตำบลป่าไผ่" egp-5501408 เชียงใหม่
 *
 * Prefer batch sync: npm run sync-contracts-cache
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { fetchContractsForAgency } from './lib/ckan-contracts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const keyword = process.argv[2];
const agencyId = process.argv[3];
const prov = process.argv[4] || '';
if (!keyword || !agencyId) {
  console.error('Usage: node scripts/cache-agency-contracts.mjs "<ชื่อหน่วยงาน>" <agencyId> [จังหวัด]');
  process.exit(1);
}

const { rows, errors } = await fetchContractsForAgency(keyword, { prov });
if (errors.length) console.warn('notes:', errors.slice(0, 5).join(' | '));

const dir = path.join(root, 'data', 'contracts-cache');
fs.mkdirSync(dir, { recursive: true });
const payload = {
  agencyId,
  keyword,
  province: prov,
  fetchedAt: new Date().toISOString(),
  source: 'egp-contact-2568',
  count: rows.length,
  rows,
};
const gzPath = path.join(dir, `${agencyId}.json.gz`);
fs.writeFileSync(gzPath, zlib.gzipSync(JSON.stringify(payload), { level: 9 }));
console.log('wrote', gzPath, 'rows', rows.length);
if (!rows.length) process.exitCode = 1;
