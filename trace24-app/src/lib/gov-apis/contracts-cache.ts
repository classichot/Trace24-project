/**
 * Offline / Vercel-safe contract cache.
 * Populated locally (home IP can reach data.go.th) then committed as .json.gz
 * because Vercel cloud IPs get HTTP 403 HTML from data.go.th.
 */

import 'server-only';

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export type ContractsCacheFile = {
  agencyId: string;
  keyword: string;
  fetchedAt: string;
  source: string;
  count: number;
  rows: Record<string, unknown>[];
  /** Human-readable reason when count is 0 (known empty, not a cache miss). */
  note?: string;
  parentAgencyId?: string;
  parentKeyword?: string;
};

function cachePaths(agencyId: string) {
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'contracts-cache');
  const safe = agencyId.replace(/[^a-zA-Z0-9._\-ก-๙]/g, '_');
  return {
    gz: path.join(dir, `${safe}.json.gz`),
    json: path.join(dir, `${safe}.json`),
  };
}

export function loadContractsCache(agencyId: string): ContractsCacheFile | null {
  const { gz, json } = cachePaths(agencyId);
  try {
    if (fs.existsSync(gz)) {
      const raw = zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8');
      return JSON.parse(raw) as ContractsCacheFile;
    }
    if (fs.existsSync(json)) {
      return JSON.parse(fs.readFileSync(json, 'utf8')) as ContractsCacheFile;
    }
  } catch {
    return null;
  }
  return null;
}

/** Also allow lookup by keyword filename slug when id unknown. */
export function loadContractsCacheByKeyword(keyword: string): ContractsCacheFile | null {
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'contracts-cache');
  if (!fs.existsSync(dir)) return null;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json.gz') && !file.endsWith('.json')) continue;
    if (file.endsWith('.json') && fs.existsSync(path.join(dir, file + '.gz'))) continue;
    try {
      const full = path.join(dir, file);
      const raw = file.endsWith('.gz')
        ? zlib.gunzipSync(fs.readFileSync(full)).toString('utf8')
        : fs.readFileSync(full, 'utf8');
      const parsed = JSON.parse(raw) as ContractsCacheFile;
      if (parsed.keyword === keyword) return parsed;
    } catch {
      /* skip */
    }
  }
  return null;
}
