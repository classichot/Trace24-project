import fs from 'fs';
import path from 'path';
import { getCatalogAgency } from '@/lib/agency-catalog';
import { isRealAgency, REAL_AGENCIES } from '@/lib/agencies';
import { buildCatalogStubReport } from '@/lib/pipeline/catalog-stub';
import {
  agencyFromSearchParams,
  buildAgencyReportFromCatalog,
} from '@/lib/pipeline/live-report';

export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const fetchContracts = url.searchParams.get('contracts') !== '0';

  // Allow any catalog selection passed from the client, not only egp-/curated ids
  const fromQuery = agencyFromSearchParams(id, url.searchParams);
  if (!isRealAgency(id) && !fromQuery) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'real', `${id}.json`);
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8');
    return Response.json(JSON.parse(raw));
  }

  const agency =
    getCatalogAgency(id) ||
    REAL_AGENCIES.find((a) => a.id === id) ||
    fromQuery;

  if (!agency) {
    // Last resort: still return a stub so scan UI never dead-ends
    if (id.startsWith('egp-') || fromQuery) {
      const fallback = fromQuery || {
        id,
        th: url.searchParams.get('th') || id,
        en: '',
        prov: '',
        dist: '',
        type: 'หน่วยงานจัดซื้อ',
        tshort: 'หน่วยจัดซื้อ',
        loc: '—',
        code: id.replace(/^egp-/, ''),
        web: '',
        real: true as const,
      };
      const report = await buildAgencyReportFromCatalog(fallback, {
        fetchContracts,
        limit: 60,
      });
      return Response.json(report, { headers: { 'X-TRACE24-Catalog-Only': '1' } });
    }
    return Response.json(
      {
        error: 'Agency not found in catalog cache',
        hint: 'Search again and select the agency, or rebuild catalog',
      },
      { status: 404 }
    );
  }

  try {
    const report = await buildAgencyReportFromCatalog(agency, {
      fetchContracts,
      limit: 80,
    });
    return Response.json(report, {
      headers: {
        'X-TRACE24-Catalog-Only': report.meta.catalogOnly ? '1' : '0',
      },
    });
  } catch {
    // Never fail hard — registry stub is enough to open the agency
    return Response.json(buildCatalogStubReport(agency), {
      headers: { 'X-TRACE24-Catalog-Only': '1' },
      status: 200,
    });
  }
}
