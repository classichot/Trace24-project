import {
  enrichWithFeatured,
  getCatalogAgency,
  getCatalogMeta,
  loadAgencyCatalog,
  searchAgencyCatalog,
} from '@/lib/agency-catalog';
import { REAL_AGENCIES } from '@/lib/agencies';
import { listCachedAgencyIds } from '@/lib/pipeline/load-report';

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
    const cached = listCachedAgencyIds().includes(agency.id);
    return Response.json({ ...agency, cached });
  }

  if (q) {
    const cached = new Set(listCachedAgencyIds());
    const results = searchAgencyCatalog(q, { limit, includeSchools }).map((a) => {
      const agency = enrichWithFeatured(a, REAL_AGENCIES);
      return { ...agency, cached: cached.has(agency.id) || !!agency.real };
    });
    return Response.json({
      q,
      count: results.length,
      results,
      meta: getCatalogMeta(),
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
