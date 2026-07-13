/**
 * Open D / govspending contract client (citizen-registerable).
 * Endpoint historically: https://opend.data.go.th/govspending/cgdcontract
 */

export type OpendContractQuery = {
  apiKey: string;
  year: number;
  keyword?: string;
  deptCode?: string;
  offset?: number;
  limit?: number;
};

export type OpendFetchResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string; bodyPreview: string };

export async function fetchCgdContracts(q: OpendContractQuery): Promise<OpendFetchResult> {
  const params = new URLSearchParams({
    'api-key': q.apiKey,
    year: String(q.year),
    offset: String(q.offset ?? 0),
    limit: String(q.limit ?? 20),
  });
  if (q.keyword) params.set('keyword', q.keyword);
  if (q.deptCode) params.set('dept_code', q.deptCode);

  const url = `https://opend.data.go.th/govspending/cgdcontract?${params}`;
  try {
    const r = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'api-key': q.apiKey,
        'User-Agent': 'TRACE24/1.0',
      },
    });
    const text = await r.text();
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error: `Open D HTTP ${r.status}`,
        bodyPreview: text.slice(0, 160).replace(/\s+/g, ' '),
      };
    }
    try {
      return { ok: true, status: r.status, data: JSON.parse(text) };
    } catch {
      return {
        ok: false,
        status: r.status,
        error: 'Open D returned non-JSON',
        bodyPreview: text.slice(0, 160).replace(/\s+/g, ' '),
      };
    }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : 'fetch failed',
      bodyPreview: '',
    };
  }
}

/** CKAN package search on data.go.th (no key required for catalog) */
export async function searchDataGoTh(query: string, rows = 10) {
  const url = `https://data.go.th/api/3/action/package_search?q=${encodeURIComponent(query)}&rows=${rows}`;
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'TRACE24/1.0' } });
  if (!r.ok) throw new Error(`data.go.th ${r.status}`);
  return r.json();
}
