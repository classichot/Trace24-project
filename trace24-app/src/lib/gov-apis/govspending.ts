/**
 * data.go.th CKAN + ภาษีไปไหน contract CSVs (datastore_search).
 * Vercel / cloud IPs often get HTML challenge pages from package_show —
 * so we prefer hardcoded datastore resource IDs + filters, then Open D fallback.
 */

import { fetchCgdContracts } from './opend';
import { loadContractsCache, loadContractsCacheByKeyword } from './contracts-cache';

const UA = {
  'User-Agent':
    'Mozilla/5.0 (compatible; TRACE24/1.1; +https://trace24-app.vercel.app) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
} as const;

/** Known egp-contact-2568 datastore shards (skip package_show on serverless). */
export const EGP_CONTACT_2568_RESOURCES = [
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
] as const;

export type CkanPackageSummary = {
  id: string;
  title: string;
  notes: string;
  resources: { id: string; name: string; format: string; url: string; datastore: boolean }[];
};

export type GovSpendingContract = {
  project_id: string;
  project_name: string;
  project_money: string;
  project_type_name: string;
  dept_name: string;
  province: string;
  district?: string;
  _fy: string;
  _source: string;
  contract: { winner: string; winner_tin: string; price_agree: string; contract_date: string }[];
};

async function readJson(res: Response, label: string) {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('<!') || trimmed.startsWith('<html')) {
    throw new Error(
      `${label} returned HTML (often blocked from cloud IPs) HTTP ${res.status}: ${trimmed.slice(0, 80).replace(/\s+/g, ' ')}`
    );
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    throw new Error(`${label} non-JSON HTTP ${res.status}: ${trimmed.slice(0, 80).replace(/\s+/g, ' ')}`);
  }
}

async function ckanFetch(url: string, label: string, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: UA,
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = await readJson(r, label);
    if (!r.ok || data.success === false) {
      const err = data.error as { message?: string } | undefined;
      throw new Error(err?.message || `${label} HTTP ${r.status}`);
    }
    return data.result as Record<string, unknown>;
  } catch (e) {
    if (e instanceof Error && /abort/i.test(e.message)) {
      throw new Error(`${label} timeout after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function ckanAction<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params);
  const result = await ckanFetch(
    `https://data.go.th/api/3/action/${action}?${qs}`,
    `CKAN ${action}`
  );
  return result as T;
}

export async function searchDataGoTh(query: string, rows = 10) {
  const result = await ckanAction<{
    count: number;
    results: Array<{
      name: string;
      title: string;
      notes?: string;
      resources?: Array<{ id: string; name: string; format: string; url: string; datastore_active?: boolean }>;
    }>;
  }>('package_search', { q: query, rows: String(rows) });

  return {
    count: result.count || 0,
    packages: (result.results || []).map(
      (p): CkanPackageSummary => ({
        id: p.name,
        title: p.title,
        notes: (p.notes || '').slice(0, 240),
        resources: (p.resources || []).map((r) => ({
          id: r.id,
          name: r.name,
          format: r.format,
          url: r.url,
          datastore: !!r.datastore_active,
        })),
      })
    ),
  };
}

import { normalizeEgpContactRow, looksLikeThaiDate } from './egp-contact-normalize';

function mapRow(row: Record<string, unknown>): GovSpendingContract {
  const n = normalizeEgpContactRow(row);
  let winner = n['ชื่อผู้ชนะ'];
  if (looksLikeThaiDate(winner)) winner = '';
  const price = n['ราคาตกลงซื้อ/จ้าง'] || n['งบสัญญา(บาท)'];
  return {
    project_id: n['รหัสโครงการ'] || '',
    project_name: n['ชื่อโครงการ'] || '',
    project_money: n['งบประมาณ(บาท)'] || '',
    project_type_name: n['กลุ่มวิธีจัดซื้อฯ'] || n['วิธีจัดซื้อฯ'] || '',
    dept_name: n['ชื่อหน่วยงาน'] || '',
    province: n['จังหวัด'] || '',
    district: n['เขต/อำเภอ'] || '',
    _fy: n['ปีงบประมาณ'] || '',
    _source: 'data.go.th/govspending-ckan',
    contract: [
      {
        winner,
        winner_tin: n['เลขนิติบุคคล'] || '',
        price_agree: price || '',
        contract_date: n['วันที่ลงนามสัญญา'] || n['วันที่ประกาศ'] || '',
      },
    ],
  };
}

function deptMatches(dept: string, keyword: string) {
  if (!dept || !keyword) return false;
  return dept === keyword || dept.includes(keyword) || keyword.includes(dept);
}

async function searchOneResource(
  resourceId: string,
  keyword: string,
  limit: number
): Promise<{ records: GovSpendingContract[]; total: number }> {
  // Prefer exact field filter (faster + more reliable than free-text q=)
  const filterQs = new URLSearchParams({
    resource_id: resourceId,
    filters: JSON.stringify({ ชื่อหน่วยงาน: keyword }),
    limit: String(Math.min(100, limit)),
    offset: '0',
  });
  try {
    const result = await ckanFetch(
      `https://data.go.th/api/3/action/datastore_search?${filterQs}`,
      `datastore_search filters ${resourceId.slice(0, 8)}`,
      10000
    );
    const records = ((result.records || []) as Record<string, unknown>[]).map(mapRow);
    return { records, total: Number(result.total || records.length) };
  } catch {
    // fall through to free-text
  }

  const qQs = new URLSearchParams({
    resource_id: resourceId,
    q: keyword,
    limit: String(Math.min(100, limit)),
    offset: '0',
  });
  const result = await ckanFetch(
    `https://data.go.th/api/3/action/datastore_search?${qQs}`,
    `datastore_search q ${resourceId.slice(0, 8)}`,
    10000
  );
  const mapped = ((result.records || []) as Record<string, unknown>[]).map(mapRow);
  const records = mapped.filter((c) => deptMatches(c.dept_name, keyword));
  return { records, total: Number(result.total || 0) };
}

async function fetchFromHardcodedResources(
  keyword: string,
  limit: number
): Promise<{ contracts: GovSpendingContract[]; totalEstimate: number; errors: string[] }> {
  const contracts: GovSpendingContract[] = [];
  const errors: string[] = [];
  let totalEstimate = 0;
  const seen = new Set<string>();

  // Parallel batches of 3 to stay under serverless time/connection limits
  const ids = [...EGP_CONTACT_2568_RESOURCES];
  for (let i = 0; i < ids.length && contracts.length < limit; i += 3) {
    const batch = ids.slice(i, i + 3);
    const results = await Promise.allSettled(
      batch.map((id) => searchOneResource(id, keyword, limit - contracts.length))
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
        continue;
      }
      totalEstimate += r.value.total;
      for (const c of r.value.records) {
        if (!c.project_name) continue;
        if (!deptMatches(c.dept_name, keyword)) continue;
        const key = `${c.project_id}|${c.contract[0]?.winner}|${c.contract[0]?.price_agree}`;
        if (seen.has(key)) continue;
        seen.add(key);
        contracts.push(c);
        if (contracts.length >= limit) break;
      }
    }
  }

  return { contracts, totalEstimate, errors };
}

function mapOpendRows(data: unknown, keyword: string): GovSpendingContract[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { result?: unknown })?.result)
      ? ((data as { result: unknown[] }).result as unknown[])
      : Array.isArray((data as { data?: unknown })?.data)
        ? ((data as { data: unknown[] }).data as unknown[])
        : [];

  const out: GovSpendingContract[] = [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const dept = String(row.dept_name || row.department || row['ชื่อหน่วยงาน'] || '');
    if (dept && !deptMatches(dept, keyword) && keyword && !dept.includes(keyword.slice(0, 8))) {
      // keep if Open D already filtered by keyword/dept_code
    }
    const projectName = String(row.project_name || row['ชื่อโครงการ'] || '');
    if (!projectName) continue;
    let winner = String(row.winner || row['ชื่อผู้ชนะ'] || row.company || '').trim();
    out.push({
      project_id: String(row.project_id || row['รหัสโครงการ'] || ''),
      project_name: projectName,
      project_money: String(row.project_money || row.budget || row['งบประมาณ(บาท)'] || ''),
      project_type_name: String(row.project_type_name || row.method || row['วิธีจัดซื้อฯ'] || ''),
      dept_name: dept || keyword,
      province: String(row.province || row['จังหวัด'] || ''),
      _fy: String(row.year || row._fy || row['ปีงบประมาณ'] || ''),
      _source: 'opend.data.go.th/cgdcontract',
      contract: [
        {
          winner,
          winner_tin: String(row.winner_tin || row.tin || row['เลขนิติบุคคล'] || '').trim(),
          price_agree: String(row.price_agree || row.contract_price || row['ราคาตกลงซื้อ/จ้าง'] || ''),
          contract_date: String(row.contract_date || row['วันที่ลงนามสัญญา'] || ''),
        },
      ],
    });
  }
  return out;
}

async function fetchFromOpenD(
  keyword: string,
  opts: { limit?: number; deptCode?: string } = {}
): Promise<GovSpendingContract[]> {
  const apiKey = process.env.OPEND_API_KEY?.trim();
  if (!apiKey) return [];

  const years = [2568, 2567, 2566].map((be) => be - 543); // roughly CE years Open D may use
  const ceYears = [2025, 2024, 2023, 2022];
  const tryYears = [...new Set([...ceYears, ...years])];
  const all: GovSpendingContract[] = [];

  for (const year of tryYears) {
    if (all.length >= (opts.limit || 40)) break;
    const res = await fetchCgdContracts({
      apiKey,
      year,
      keyword,
      deptCode: opts.deptCode,
      limit: Math.min(50, (opts.limit || 40) - all.length),
      timeoutMs: 8000,
    });
    if (!res.ok) continue;
    all.push(...mapOpendRows(res.data, keyword));
  }
  return all.slice(0, opts.limit || 40);
}

export async function fetchGovSpendingContracts(
  keyword: string,
  opts: { packageId?: string; limit?: number; deptCode?: string; agencyId?: string } = {}
): Promise<{
  contracts: GovSpendingContract[];
  packageId: string;
  totalEstimate: number;
  fetchNotes: string[];
}> {
  const limit = opts.limit ?? 50;
  const notes: string[] = [];
  const packageId = opts.packageId || 'egp-contact-2568';

  // 0) Committed cache — works on Vercel when data.go.th blocks cloud IPs
  try {
    const cached =
      (opts.agencyId ? loadContractsCache(opts.agencyId) : null) ||
      loadContractsCacheByKeyword(keyword);
    if (cached) {
      // Prefer a deeper slice from committed cache (local/Vercel) so large กรม
      // agencies are not capped at the live CKAN default of ~50–80 rows.
      const readSlice = (file: typeof cached, matchKw: string) => {
        const cacheLimit = Math.max(
          limit,
          Math.min(400, file.count || (file.rows || []).length || 0)
        );
        const cacheKw = file.keyword || '';
        const contracts = (file.rows || [])
          .map(mapRow)
          .filter(
            (c) =>
              c.project_name &&
              (deptMatches(c.dept_name, matchKw) ||
                (cacheKw && deptMatches(c.dept_name, cacheKw)))
          )
          .slice(0, cacheLimit);
        return { contracts, cacheLimit, total: file.count || contracts.length };
      };

      let { contracts, total } = readSlice(cached, keyword);
      let used = cached;
      if (!contracts.length && cached.parentAgencyId) {
        const parent = loadContractsCache(cached.parentAgencyId);
        if (parent && (parent.count || (parent.rows || []).length)) {
          const parentKw = cached.parentKeyword || parent.keyword || keyword;
          const fromParent = readSlice(parent, parentKw);
          if (fromParent.contracts.length) {
            contracts = fromParent.contracts;
            total = fromParent.total;
            used = parent;
            notes.push(
              `contracts-cache parent ${parent.agencyId} (${parentKw}) — alias of ${cached.agencyId || keyword}`
            );
          }
        }
      }
      if (contracts.length) {
        notes.push(
          `contracts-cache ${contracts.length}/${total || contracts.length} rows (${used.fetchedAt})`
        );
        return {
          contracts,
          packageId: used.source || 'contracts-cache',
          totalEstimate: total || contracts.length,
          fetchNotes: notes,
        };
      }
      // Explicit empty cache: do NOT fall through to live CKAN (403 on Vercel)
      notes.push(
        cached.note ||
          `contracts-cache empty for ${cached.agencyId || keyword} (${cached.fetchedAt || '—'})`
      );
      return {
        contracts: [],
        packageId: cached.source || 'contracts-cache',
        totalEstimate: 0,
        fetchNotes: notes,
      };
    }
  } catch (e) {
    notes.push(`contracts-cache: ${e instanceof Error ? e.message : 'error'}`);
  }

  // 1) Hardcoded resources — avoids package_show HTML blocks on Vercel
  try {
    const hard = await fetchFromHardcodedResources(keyword, limit);
    notes.push(...hard.errors.slice(0, 3));
    if (hard.contracts.length) {
      notes.push(`ckan-hardcoded ${hard.contracts.length} rows`);
      return {
        contracts: hard.contracts,
        packageId,
        totalEstimate: hard.totalEstimate || hard.contracts.length,
        fetchNotes: notes,
      };
    }
    if (hard.errors.length) {
      notes.push(`ckan-hardcoded empty after ${hard.errors.length} resource errors`);
    } else {
      notes.push('ckan-hardcoded returned 0 matching rows');
    }
  } catch (e) {
    notes.push(`ckan-hardcoded: ${e instanceof Error ? e.message : 'error'}`);
  }

  // 2) Classic package_show path (works from home/office IPs)
  try {
    const pkg = await ckanAction<{
      resources: Array<{ id: string; name: string; datastore_active?: boolean }>;
    }>('package_show', { id: packageId });
    const contracts: GovSpendingContract[] = [];
    let totalEstimate = 0;
    for (const res of pkg.resources || []) {
      if (!res.datastore_active) continue;
      const { records, total } = await searchOneResource(res.id, keyword, limit - contracts.length);
      totalEstimate += total;
      contracts.push(...records);
      if (contracts.length >= limit) break;
    }
    if (contracts.length) {
      notes.push(`ckan-package_show ${contracts.length} rows`);
      return { contracts: contracts.slice(0, limit), packageId, totalEstimate, fetchNotes: notes };
    }
    notes.push('ckan-package_show 0 rows');
  } catch (e) {
    notes.push(`ckan-package_show: ${e instanceof Error ? e.message : 'error'}`);
  }

  // 3) Open D fallback (needs OPEND_API_KEY on Vercel)
  try {
    const opend = await fetchFromOpenD(keyword, { limit, deptCode: opts.deptCode });
    if (opend.length) {
      notes.push(`opend ${opend.length} rows`);
      return {
        contracts: opend,
        packageId: 'opend-cgdcontract',
        totalEstimate: opend.length,
        fetchNotes: notes,
      };
    }
    notes.push('opend 0 rows or key missing');
  } catch (e) {
    notes.push(`opend: ${e instanceof Error ? e.message : 'error'}`);
  }

  const errSummary = notes.join(' · ') || 'all sources empty';
  return {
    contracts: [],
    packageId,
    totalEstimate: 0,
    fetchNotes: [...notes, `empty: ${errSummary}`],
  };
}

export function govSpendingPortalSearchUrl(keyword: string) {
  return `https://govspending.data.go.th/#/search?keyword=${encodeURIComponent(keyword)}`;
}
