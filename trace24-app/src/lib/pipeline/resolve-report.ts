import 'server-only';

import { getCatalogAgency } from '@/lib/agency-catalog';
import { isRealAgency, REAL_AGENCIES } from '@/lib/agencies';
import { buildAgencyReportFromCatalog } from './live-report';
import { loadAgencyReport } from './load-report';
import { withRelatedPartyOverlay } from './related-party-store';
import type { PipelineReportLike } from './types';

/**
 * Resolve a full agency report for pipeline APIs (investigate / RAG).
 * Prefer data/real/{id}.json; otherwise build from catalog + contracts-cache.
 */
export async function resolveAgencyReport(
  id: string,
  opts: { fetchContracts?: boolean } = {}
): Promise<PipelineReportLike | null> {
  if (!isRealAgency(id)) return null;

  const cached = loadAgencyReport(id);
  if (cached) return cached;

  const agency =
    getCatalogAgency(id) || REAL_AGENCIES.find((a) => a.id === id) || null;
  if (!agency) return null;

  const report = await buildAgencyReportFromCatalog(agency, {
    fetchContracts: opts.fetchContracts !== false,
    limit: 80,
  });
  return withRelatedPartyOverlay(report as unknown as PipelineReportLike);
}
