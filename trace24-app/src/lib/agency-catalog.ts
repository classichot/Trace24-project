import 'server-only';

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { AgencyRecord } from './agencies';
import { provinceFromEgpCode } from './province-from-egp-code';

type CatalogFile = {
  generatedAt: string;
  source: { packageId: string; title: string; url: string };
  count: number;
  byType: Record<string, number>;
  fields: string[];
  rows: Array<[string, string, string, string, string, string, string, string, number]>;
};

export type CatalogAgency = AgencyRecord & {
  aff?: string;
  cached?: boolean;
};

let cache: CatalogAgency[] | null = null;
let meta: Omit<CatalogFile, 'rows' | 'fields'> | null = null;
const byId = new Map<string, CatalogAgency>();

/** Category keywords users type to browse a whole class of agencies */
export const CATEGORY_ALIASES: Record<string, string[]> = {
  เทศบาล: ['เทศบาลตำบล', 'เทศบาลเมือง', 'เทศบาลนคร'],
  เทศบาลตำบล: ['เทศบาลตำบล'],
  เทศบาลเมือง: ['เทศบาลเมือง'],
  เทศบาลนคร: ['เทศบาลนคร'],
  อำเภอ: ['อำเภอ'],
  จังหวัด: ['จังหวัด'],
  กระทรวง: ['กระทรวง'],
  ทบวง: ['ทบวง'],
  กรม: ['กรม'],
  โรงเรียน: ['โรงเรียน', 'สถานศึกษา'],
  โรงเรียนรัฐ: ['โรงเรียน', 'สถานศึกษา'],
  มหาวิทยาลัย: ['มหาวิทยาลัย'],
  วิทยาลัย: ['วิทยาลัย'],
  โรงพยาบาล: ['โรงพยาบาล'],
  โรงพยาบาลรัฐ: ['โรงพยาบาล', 'สถานพยาบาล'],
  สถานพยาบาล: ['โรงพยาบาล', 'สถานพยาบาล'],
  อบต: ['อบต.'],
  'อบต.': ['อบต.'],
  อบจ: ['อบจ.'],
  'อบจ.': ['อบจ.'],
};

function locLine(prov: string, dist: string) {
  if (prov && dist) return `อ.${dist} · จ.${prov}`;
  if (prov) return `จ.${prov}`;
  return '—';
}

function rowToAgency(row: CatalogFile['rows'][number]): CatalogAgency {
  const [id, th, code, tshort, type, prov, dist, aff, realFlag] = row;
  const useProv = prov || provinceFromEgpCode(code) || '';
  const useDist = dist || '';
  return {
    id,
    th,
    en: '',
    prov: useProv,
    dist: useDist,
    type,
    tshort,
    loc: locLine(useProv, useDist),
    code: code || '—',
    web: '',
    aff,
    ...(realFlag ? { real: true } : {}),
  };
}

function catalogPaths() {
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'catalog');
  return {
    gz: path.join(dir, 'agencies.json.gz'),
    json: path.join(dir, 'agencies.json'),
  };
}

export function loadAgencyCatalog(): CatalogAgency[] {
  if (cache) return cache;
  const { gz, json } = catalogPaths();
  let raw: string;
  if (fs.existsSync(gz)) {
    raw = zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8');
  } else if (fs.existsSync(json)) {
    raw = fs.readFileSync(json, 'utf8');
  } else {
    cache = [];
    meta = {
      generatedAt: '',
      source: { packageId: '', title: '', url: '' },
      count: 0,
      byType: {},
    };
    return cache;
  }

  const parsed = JSON.parse(raw) as CatalogFile;
  meta = {
    generatedAt: parsed.generatedAt,
    source: parsed.source,
    count: parsed.count,
    byType: parsed.byType,
  };
  cache = (parsed.rows || []).map(rowToAgency);
  byId.clear();
  for (const a of cache) byId.set(a.id, a);
  return cache;
}

export function getCatalogMeta() {
  loadAgencyCatalog();
  return meta;
}

export function getCatalogAgency(id: string | null | undefined): CatalogAgency | undefined {
  if (!id) return undefined;
  loadAgencyCatalog();
  return byId.get(id);
}

/** Merge curated fields (en/web) onto a catalog hit when available. */
export function enrichWithFeatured(
  agency: CatalogAgency,
  featured: AgencyRecord[]
): CatalogAgency {
  const f = featured.find((x) => x.id === agency.id);
  if (!f) return agency;
  return {
    ...agency,
    ...f,
    code: agency.code && agency.code !== '—' ? agency.code : f.code,
    aff: agency.aff,
    real: true,
  };
}

export function isCatalogAgency(id: string | null | undefined): id is string {
  return !!getCatalogAgency(id);
}

function normalizeSearch(s: string) {
  return s.toLowerCase().replace(/[\s\-_.]+/g, '');
}

/** Strip common prefixes only when the remainder is still useful for matching. */
function stripOrgPrefixes(s: string) {
  const stripped = s.replace(
    /เทศบาลตำบล|เทศบาลเมือง|เทศบาลนคร|เทศบาล|องค์การบริหารส่วนตำบล|อบต\.?|องค์การบริหารส่วนจังหวัด|อบจ\.?/g,
    ''
  );
  return stripped.length >= 2 ? stripped : s;
}

function resolveCategory(query: string): string[] | null {
  const key = query.trim().toLowerCase().replace(/\s+/g, '');
  for (const [alias, types] of Object.entries(CATEGORY_ALIASES)) {
    if (alias.toLowerCase().replace(/\s+/g, '') === key) return types;
  }
  return null;
}

function scoreAgency(a: CatalogAgency, needle: string, raw: string, categoryBoost: boolean): number {
  const thN = stripOrgPrefixes(normalizeSearch(a.th));
  const hay = normalizeSearch([a.th, a.code, a.prov, a.dist, a.tshort, a.type, a.aff || '', a.id].join(' '));
  let score = 0;
  if (a.real) score += 1000;
  if (categoryBoost) score += 50;
  if (a.th === raw || a.th.includes(raw)) score += 500;
  if (thN === needle) score += 400;
  if (thN.startsWith(needle)) score += 300;
  if (hay.includes(needle)) score += 100;
  if (String(a.code).includes(raw) || String(a.code).toLowerCase().includes(needle)) score += 250;
  // Prefer core civic / ministry classes slightly when ranking ties
  const prefer = new Set([
    'เทศบาลตำบล',
    'เทศบาลเมือง',
    'เทศบาลนคร',
    'กระทรวง',
    'กรม',
    'จังหวัด',
    'อำเภอ',
    'มหาวิทยาลัย',
    'โรงพยาบาล',
  ]);
  if (prefer.has(a.tshort)) score += 15;
  return score;
}

export function searchAgencyCatalog(
  query: string,
  opts: { limit?: number; includeSchools?: boolean } = {}
): CatalogAgency[] {
  const q = query.trim();
  if (q.length < 1) return [];
  const limit = opts.limit ?? 20;
  const all = loadAgencyCatalog();

  const categoryTypes = resolveCategory(q);
  if (categoryTypes) {
    const matched = all.filter((a) => categoryTypes.includes(a.tshort));
    if (matched.length > 0) {
      matched.sort((a, b) => {
        if (!!b.real !== !!a.real) return a.real ? -1 : 1;
        return a.th.localeCompare(b.th, 'th');
      });
      return matched.slice(0, limit);
    }
  }

  const needle = stripOrgPrefixes(normalizeSearch(q));
  const raw = q.toLowerCase();
  const scored: { a: CatalogAgency; s: number }[] = [];

  for (const a of all) {
    const hay = normalizeSearch([a.th, a.code, a.prov, a.dist, a.tshort, a.type, a.id].join(' '));
    const hayRaw = [a.th, a.code, a.prov, a.dist, a.tshort, a.type, a.id].join(' ').toLowerCase();
    const thN = stripOrgPrefixes(normalizeSearch(a.th));
    if (
      !(
        hay.includes(needle) ||
        hayRaw.includes(raw) ||
        a.th.includes(q) ||
        thN.includes(needle) ||
        a.tshort.includes(q)
      )
    ) {
      continue;
    }
    scored.push({ a, s: scoreAgency(a, needle, q, false) });
  }
  scored.sort(
    (x, y) =>
      y.s - x.s ||
      x.a.th.localeCompare(y.a.th, 'th') ||
      (x.a.prov || '').localeCompare(y.a.prov || '', 'th') ||
      String(x.a.code).localeCompare(String(y.a.code))
  );

  // Expand อปท. name collisions so every province/code variant appears (ป่าไผ่ CM+LP, etc.)
  const hardCap = Math.max(limit, 40);
  const out: CatalogAgency[] = [];
  const seen = new Set<string>();
  const localShort = new Set(['เทศบาลตำบล', 'เทศบาลเมือง', 'เทศบาลนคร', 'อบต.', 'อบจ.']);
  for (const { a } of scored) {
    if (seen.has(a.id)) continue;
    if (localShort.has(a.tshort)) {
      const siblings = all
        .filter((x) => x.th === a.th && localShort.has(x.tshort))
        .sort(
          (x, y) =>
            (x.prov || '').localeCompare(y.prov || '', 'th') ||
            String(x.code).localeCompare(String(y.code))
        );
      for (const s of siblings) {
        if (seen.has(s.id)) continue;
        out.push(s);
        seen.add(s.id);
      }
    } else {
      out.push(a);
      seen.add(a.id);
    }
    if (out.length >= hardCap) break;
  }
  return out.slice(0, hardCap);
}

export function listFeaturedCatalogAgencies(): CatalogAgency[] {
  return loadAgencyCatalog().filter((a) => a.real);
}
