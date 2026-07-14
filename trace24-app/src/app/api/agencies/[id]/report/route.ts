import fs from 'fs';
import path from 'path';
import { getCatalogAgency } from '@/lib/agency-catalog';
import { websiteForAgency } from '@/lib/agency-websites';
import { isRealAgency, REAL_AGENCIES } from '@/lib/agencies';
import { buildCatalogStubReport } from '@/lib/pipeline/catalog-stub';
import { ensureAgencyExecutives } from '@/lib/pipeline/ensure-executives';
import {
  agencyFromSearchParams,
  buildAgencyReportFromCatalog,
} from '@/lib/pipeline/live-report';
import { withRelatedPartyOverlay } from '@/lib/pipeline/related-party-store';
import type { PipelineReportLike } from '@/lib/pipeline/types';

export const maxDuration = 60;

async function withAutoExecutives(
  report: PipelineReportLike,
  opts: { agencyId: string; agencyName: string; web?: string; enabled: boolean }
) {
  let withRelated = withRelatedPartyOverlay(report);
  if (!opts.enabled) return withRelated;

  const hasExec = Array.isArray(withRelated.executives) && withRelated.executives.length > 0;
  const web = opts.web || websiteForAgency(opts.agencyId) || '';
  if (hasExec || !web) return withRelated;

  try {
    const ensured = await ensureAgencyExecutives({
      agencyId: opts.agencyId,
      agencyName: opts.agencyName,
      web,
      onlyIfEmpty: true,
    });
    if (ensured.saved || ensured.attempted) {
      withRelated = withRelatedPartyOverlay(report);
      if (withRelated.meta && ensured.note) {
        withRelated.meta = {
          ...withRelated.meta,
          relatedPartyNote: [
            withRelated.relatedParty?.coverage,
            ensured.note,
          ]
            .filter(Boolean)
            .join(' · '),
        };
      }
    }
  } catch {
    /* keep report without executives */
  }
  return withRelated;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const fetchContracts = url.searchParams.get('contracts') !== '0';
  const autoExecutives = url.searchParams.get('autoExecutives') !== '0';

  // Allow any catalog selection passed from the client, not only egp-/curated ids
  const fromQuery = agencyFromSearchParams(id, url.searchParams);
  if (!isRealAgency(id) && !fromQuery) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'real', `${id}.json`);
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      projects?: Record<string, unknown>;
      priorityOrder?: string[];
      stats?: { label: string; value: string }[];
      agency?: { th?: string; web?: string };
    };
    const projectCount = Object.keys(raw.projects || {}).length;
    const priorityCount = Array.isArray(raw.priorityOrder) ? raw.priorityOrder.length : 0;
    const projectStat = (raw.stats || []).find((s) => s.label === 'โครงการ');
    const statsSayZero = projectStat ? /^0+$/.test(String(projectStat.value).replace(/\D/g, '') || '0') : false;
    // Stale curated snapshots (e.g. nongyaeng) can hold projects but empty priorityOrder/stats → blank dashboard
    const usable = !(projectCount > 0 && (priorityCount === 0 || statsSayZero));
    if (usable) {
      const finalized = await withAutoExecutives(raw as PipelineReportLike, {
        agencyId: id,
        agencyName: raw.agency?.th || id,
        web: raw.agency?.web || websiteForAgency(id),
        enabled: autoExecutives,
      });
      return Response.json(finalized);
    }
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
      const finalized = await withAutoExecutives(report as unknown as PipelineReportLike, {
        agencyId: id,
        agencyName: fallback.th,
        web: fallback.web || websiteForAgency(id),
        enabled: autoExecutives,
      });
      return Response.json(finalized, {
        headers: { 'X-TRACE24-Catalog-Only': '1' },
      });
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
    const finalized = await withAutoExecutives(report as unknown as PipelineReportLike, {
      agencyId: agency.id,
      agencyName: agency.th,
      web: agency.web || websiteForAgency(agency.id),
      enabled: autoExecutives,
    });
    return Response.json(finalized, {
      headers: {
        'X-TRACE24-Catalog-Only': finalized.meta?.catalogOnly ? '1' : '0',
      },
    });
  } catch {
    // Never fail hard — registry stub is enough to open the agency
    const stub = buildCatalogStubReport(agency) as unknown as PipelineReportLike;
    const finalized = await withAutoExecutives(stub, {
      agencyId: agency.id,
      agencyName: agency.th,
      web: agency.web || websiteForAgency(agency.id),
      enabled: autoExecutives,
    });
    return Response.json(finalized, {
      headers: { 'X-TRACE24-Catalog-Only': '1' },
      status: 200,
    });
  }
}
