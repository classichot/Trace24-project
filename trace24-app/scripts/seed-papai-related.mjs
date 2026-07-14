/**
 * Seed related-party company stubs for Papai CM/LP from repaired contracts-cache.
 *   node scripts/seed-papai-related.mjs
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { looksLikeWinnerName, looksLikeTin } from './lib/egp-contact-row.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'data', 'contracts-cache');
const RELATED_DIR = path.join(ROOT, 'data', 'related');

const TARGETS = [
  {
    id: 'egp-5501408',
    th: 'เทศบาลตำบลป่าไผ่',
    prov: 'เชียงใหม่',
    web: 'https://www.paphaichiangmai.go.th/',
  },
  {
    id: 'egp-6510407',
    th: 'เทศบาลตำบลป่าไผ่',
    prov: 'ลำพูน',
    web: 'https://www.paphai.go.th/',
  },
];

function topCompanies(rows, limit = 10) {
  const map = new Map();
  for (const r of rows || []) {
    const name = String(r['ชื่อผู้ชนะ'] || '').replace(/\s+/g, ' ').trim();
    if (!looksLikeWinnerName(name)) continue;
    const tin = String(r['เลขนิติบุคคล'] || '').replace(/\D/g, '');
    const key = looksLikeTin(tin) ? tin : name.toLowerCase();
    const prev = map.get(key) || { name, tin: looksLikeTin(tin) ? tin : '', n: 0 };
    prev.n++;
    if (looksLikeTin(tin)) prev.tin = tin;
    if (name.length > prev.name.length) prev.name = name;
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.n - a.n).slice(0, limit);
}

fs.mkdirSync(RELATED_DIR, { recursive: true });

for (const t of TARGETS) {
  const cachePath = path.join(CACHE_DIR, `${t.id}.json.gz`);
  if (!fs.existsSync(cachePath)) {
    console.warn('missing cache', t.id);
    continue;
  }
  const cache = JSON.parse(zlib.gunzipSync(fs.readFileSync(cachePath)).toString('utf8'));
  const companies = topCompanies(cache.rows, 12).map((c) => ({
    tin: c.tin || undefined,
    name: c.name,
    directors: [],
    sourceUrl: c.tin
      ? `https://datawarehouse.dbd.go.th/company/profile/1/${c.tin}`
      : 'https://datawarehouse.dbd.go.th/',
    fetchedAt: new Date().toISOString(),
  }));

  const pack = {
    agencyId: t.id,
    updatedAt: new Date().toISOString(),
    note: `${t.th} จ.${t.prov} — stub ผู้ชนะจาก contracts-cache · ใส่กรรมการจาก DBD/บอจ.5 และทำเนียบจาก ${t.web}`,
    executives: [],
    companies,
  };
  const out = path.join(RELATED_DIR, `${t.id}.json`);
  fs.writeFileSync(out, JSON.stringify(pack, null, 2), 'utf8');
  console.log('wrote', out, 'companies', companies.length);
}
