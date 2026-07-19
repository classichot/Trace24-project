import 'server-only';

import fs from 'fs';
import path from 'path';
import type { CompanyMasterRecord, CompanySourceRef } from './types';
import { normalizeTin } from './types';

function isServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function committedDir() {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'companies');
}

function writableDir() {
  if (isServerless()) return path.join('/tmp', 'trace24-companies');
  return committedDir();
}

function companyFile(dir: string, tin: string) {
  return path.join(dir, `${tin}.json`);
}

function readFile(file: string): CompanyMasterRecord | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as CompanyMasterRecord;
  } catch {
    return null;
  }
}

function listTinsIn(dir: string): string[] {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => /^\d{13}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

export function loadCompany(tinRaw: string): CompanyMasterRecord | null {
  const tin = normalizeTin(tinRaw);
  if (!tin) return null;
  return readFile(companyFile(writableDir(), tin)) || readFile(companyFile(committedDir(), tin));
}

export function listCompanyTins(): string[] {
  const set = new Set<string>([...listTinsIn(committedDir()), ...listTinsIn(writableDir())]);
  return [...set].sort();
}

export function listCompanies(limit = 200): CompanyMasterRecord[] {
  const out: CompanyMasterRecord[] = [];
  for (const tin of listCompanyTins()) {
    const c = loadCompany(tin);
    if (c) out.push(c);
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => b.contractWinCount - a.contractWinCount || a.name.localeCompare(b.name, 'th'));
}

export function companyMasterStats() {
  const tins = listCompanyTins();
  let withDirectors = 0;
  let withAddress = 0;
  let bdex = 0;
  for (const tin of tins.slice(0, 5000)) {
    const c = loadCompany(tin);
    if (!c) continue;
    if (c.directors?.length) withDirectors += 1;
    if (c.address && c.address !== '—') withAddress += 1;
    if (c.confidence === 'bdex') bdex += 1;
  }
  return {
    total: tins.length,
    withDirectors,
    withAddress,
    bdexVerified: bdex,
    strategy:
      'Open-DBD path: TIN primary key from contracts-cache → enrich open refs → BDEX API later. DBD warehouse scrape is fallback only.',
  };
}

function mergeAliases(a: string[], b: string[], primary: string): string[] {
  const set = new Set<string>();
  for (const x of [...a, ...b, primary]) {
    const t = String(x || '').replace(/\s+/g, ' ').trim();
    if (t && t !== primary) set.add(t);
  }
  return [...set].slice(0, 24);
}

function mergeSources(a: CompanySourceRef[], b: CompanySourceRef[]): CompanySourceRef[] {
  const out = [...(a || [])];
  for (const s of b || []) {
    const dup = out.some(
      (x) => x.kind === s.kind && (x.url || '') === (s.url || '') && x.fetchedAt === s.fetchedAt
    );
    if (!dup) out.push(s);
  }
  return out.slice(-40);
}

function mergeDirectors(
  a: CompanyMasterRecord['directors'],
  b: CompanyMasterRecord['directors']
): CompanyMasterRecord['directors'] {
  const map = new Map<string, CompanyMasterRecord['directors'][number]>();
  for (const d of [...(a || []), ...(b || [])]) {
    const key = String(d.name || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, d);
  }
  return [...map.values()].slice(0, 80);
}

export type UpsertCompanyInput = Partial<CompanyMasterRecord> & {
  tin: string;
  name?: string;
};

/** Upsert by TIN — never invents a TIN. */
export function upsertCompany(input: UpsertCompanyInput): CompanyMasterRecord | null {
  const tin = normalizeTin(input.tin);
  if (!tin) return null;
  const now = new Date().toISOString();
  const prev = loadCompany(tin);
  const name =
    String(input.name || prev?.name || '').replace(/\s+/g, ' ').trim() || `นิติบุคคล ${tin}`;

  const next: CompanyMasterRecord = {
    tin,
    name,
    aliases: mergeAliases(prev?.aliases || [], input.aliases || [], name),
    address: input.address ?? prev?.address,
    directors: mergeDirectors(prev?.directors || [], input.directors || []),
    registeredAt: input.registeredAt !== undefined ? input.registeredAt : prev?.registeredAt,
    registeredAtPrecision: input.registeredAtPrecision ?? prev?.registeredAtPrecision,
    registeredAtSource: input.registeredAtSource ?? prev?.registeredAtSource,
    registeredAtSourceUrl: input.registeredAtSourceUrl ?? prev?.registeredAtSourceUrl,
    registeredAtQuote: input.registeredAtQuote ?? prev?.registeredAtQuote,
    registeredAtConfidence: input.registeredAtConfidence ?? prev?.registeredAtConfidence,
    registeredAtNote: input.registeredAtNote ?? prev?.registeredAtNote,
    registeredCapital:
      input.registeredCapital !== undefined ? input.registeredCapital : prev?.registeredCapital,
    sources: mergeSources(prev?.sources || [], input.sources || []),
    seenAgencyIds: [
      ...new Set([...(prev?.seenAgencyIds || []), ...(input.seenAgencyIds || [])]),
    ].slice(0, 200),
    contractWinCount: Math.max(prev?.contractWinCount || 0, input.contractWinCount || 0),
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    confidence: input.confidence || prev?.confidence || 'draft',
    note: input.note ?? prev?.note,
  };

  // Prefer richer confidence
  const rank = { draft: 0, open_dbd: 1, bdex: 2 } as const;
  if (prev && rank[prev.confidence] > rank[next.confidence]) {
    next.confidence = prev.confidence;
  }

  const dir = writableDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(companyFile(dir, tin), JSON.stringify(next, null, 2), 'utf8');

  if (!isServerless()) {
    try {
      const committed = committedDir();
      fs.mkdirSync(committed, { recursive: true });
      fs.writeFileSync(companyFile(committed, tin), JSON.stringify(next, null, 2), 'utf8');
    } catch {
      /* ignore */
    }
  }
  return next;
}
