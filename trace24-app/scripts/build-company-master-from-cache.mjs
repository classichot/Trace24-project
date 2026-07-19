/**
 * Build Open-DBD–shaped company master stubs from contracts-cache.
 * Primary key = เลขนิติบุคคล (13 digits).
 *
 *   node scripts/build-company-master-from-cache.mjs
 *   node scripts/build-company-master-from-cache.mjs --limit=5000
 *
 * Does NOT scrape DBD DataWarehouse. Seeds TIN + winner name + agency links
 * for later BDEX / open enrichment.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { looksLikeTin, looksLikeWinnerName, normalizeEgpContactRow } from './lib/egp-contact-row.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'data', 'contracts-cache');
const OUT_DIR = path.join(ROOT, 'data', 'companies');

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const MAX_COMPANIES = limitArg ? Number(limitArg.split('=')[1]) || 20000 : 20000;

fs.mkdirSync(OUT_DIR, { recursive: true });

/** @type {Map<string, { tin: string, name: string, aliases: Set<string>, agencies: Set<string>, wins: number }>} */
const map = new Map();

function loadCache(file) {
  const full = path.join(CACHE_DIR, file);
  const raw = file.endsWith('.gz')
    ? zlib.gunzipSync(fs.readFileSync(full)).toString('utf8')
    : fs.readFileSync(full, 'utf8');
  return JSON.parse(raw);
}

const files = fs.existsSync(CACHE_DIR)
  ? fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json.gz') || (f.endsWith('.json') && !f.endsWith('.json.gz')))
  : [];

let filesRead = 0;
for (const file of files) {
  if (file.endsWith('.json') && fs.existsSync(path.join(CACHE_DIR, file + '.gz'))) continue;
  let cache;
  try {
    cache = loadCache(file);
  } catch {
    continue;
  }
  filesRead += 1;
  const agencyId = String(cache.agencyId || file.replace(/\.json(\.gz)?$/, ''));
  for (const row of cache.rows || []) {
    const n = normalizeEgpContactRow(row);
    const tin = String(n['เลขนิติบุคคล'] || row['เลขนิติบุคคล'] || '').replace(/\D/g, '');
    if (!looksLikeTin(tin)) continue;
    const name = String(n['ชื่อผู้ชนะ'] || row['ชื่อผู้ชนะ'] || '').replace(/\s+/g, ' ').trim();
    if (!looksLikeWinnerName(name)) continue;
    const prev = map.get(tin) || {
      tin,
      name,
      aliases: new Set(),
      agencies: new Set(),
      wins: 0,
    };
    prev.wins += 1;
    prev.agencies.add(agencyId);
    if (name && name !== prev.name) prev.aliases.add(name);
    if (name.length > prev.name.length) prev.name = name;
    map.set(tin, prev);
  }
}

const ranked = [...map.values()].sort((a, b) => b.wins - a.wins).slice(0, MAX_COMPANIES);
const now = new Date().toISOString();
let written = 0;

for (const c of ranked) {
  const outPath = path.join(OUT_DIR, `${c.tin}.json`);
  let prev = null;
  if (fs.existsSync(outPath)) {
    try {
      prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    } catch {
      prev = null;
    }
  }
  const next = {
    tin: c.tin,
    name: c.name || prev?.name || `นิติบุคคล ${c.tin}`,
    aliases: [...new Set([...(prev?.aliases || []), ...c.aliases])].filter((a) => a !== c.name).slice(0, 24),
    address: prev?.address,
    directors: prev?.directors || [],
    registeredAt: prev?.registeredAt ?? null,
    registeredCapital: prev?.registeredCapital ?? null,
    sources: [
      ...(prev?.sources || []),
      {
        kind: 'contracts-cache',
        fetchedAt: now,
        note: `seed from ${c.wins} contract rows · ${c.agencies.size} agencies`,
      },
    ].slice(-40),
    seenAgencyIds: [...new Set([...(prev?.seenAgencyIds || []), ...c.agencies])].slice(0, 200),
    contractWinCount: Math.max(prev?.contractWinCount || 0, c.wins),
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    confidence: prev?.confidence || 'draft',
    note:
      prev?.note ||
      'Open-DBD stub: TIN from e-GP/contracts-cache. Enrich via open refs; verify later with BDEX.',
  };
  fs.writeFileSync(outPath, JSON.stringify(next, null, 2), 'utf8');
  written += 1;
}

console.log(
  JSON.stringify(
    {
      ok: true,
      cacheFiles: filesRead,
      uniqueTins: map.size,
      written,
      outDir: OUT_DIR,
      strategy: 'TIN PK from contracts-cache — no DBD warehouse scrape',
    },
    null,
    2
  )
);
