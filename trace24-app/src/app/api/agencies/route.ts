import {
  enrichWithFeatured,
  getCatalogAgency,
  getCatalogMeta,
  loadAgencyCatalog,
  searchAgencyCatalog,
} from '@/lib/agency-catalog';
import { REAL_AGENCIES } from '@/lib/agencies';
import { hasContractsCache } from '@/lib/gov-apis/contracts-cache';
import { listCachedAgencyIds } from '@/lib/pipeline/load-report';

function agencyHasReport(agencyId: string, real?: boolean) {
  return !!real || listCachedAgencyIds().includes(agencyId) || hasContractsCache(agencyId);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const id = url.searchParams.get('id')?.trim() || '';
  const limit = Math.min(40, Math.max(1, Number(url.searchParams.get('limit') || 20)));
  const includeSchools = url.searchParams.get('schools') === '1';

  if (id) {
    const raw = getCatalogAgency(id) || REAL_AGENCIES.find((a) => a.id === id);
    if (!raw) return Response.json({ error: 'not found' }, { status: 404 });
    const agency = enrichWithFeatured(raw as typeof REAL_AGENCIES[number], REAL_AGENCIES);
    const cached = agencyHasReport(agency.id, agency.real);
    return Response.json({ ...agency, cached });
  }

  if (q) {
    // Oversample then keep only agencies that can produce a report (contracts-cache / curated).
    // Empty catalog stubs (e.g. จังหวัดไม่ทราบ without cache) stay out of search.
    const includeAll = url.searchParams.get('all') === '1';
    const pool = searchAgencyCatalog(q, {
      limit: includeAll ? limit : Math.max(limit * 12, 120),
      includeSchools,
    });
    const results = pool
      .map((a) => {
        const agency = enrichWithFeatured(a, REAL_AGENCIES);
        const cached = agencyHasReport(agency.id, agency.real);
        return { ...agency, cached };
      })
      .filter((a) => includeAll || a.cached)
      .slice(0, limit);
    return Response.json({
      q,
      count: results.length,
      results,
      meta: getCatalogMeta(),
      filter: includeAll ? 'all' : 'with_report',
    });
  }

  loadAgencyCatalog();
  const meta = getCatalogMeta();
  return Response.json({
    featured: REAL_AGENCIES,
    meta,
    hint: 'Use ?q= to search the national e-GP buyer catalog',
  });
}
