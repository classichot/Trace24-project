import 'server-only';

import fs from 'fs';
import path from 'path';
import {
  applyRelatedPartyToReport,
  emptyRelatedPack,
  type RelatedPartyPack,
} from './related-party';
import type { PipelineReportLike } from './types';

function relatedDir() {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'related');
}

function relatedPath(agencyId: string) {
  const safe = agencyId.replace(/[^a-zA-Z0-9._\-ก-๙]/g, '_');
  return path.join(relatedDir(), `${safe}.json`);
}

export function loadRelatedPartyPack(agencyId: string): RelatedPartyPack | null {
  const file = relatedPath(agencyId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as RelatedPartyPack;
  } catch {
    return null;
  }
}

export function saveRelatedPartyPack(agencyId: string, pack: RelatedPartyPack): RelatedPartyPack {
  const dir = relatedDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const next: RelatedPartyPack = {
    ...pack,
    agencyId,
    updatedAt: new Date().toISOString(),
    executives: pack.executives || [],
    companies: pack.companies || [],
  };
  fs.writeFileSync(relatedPath(agencyId), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/** Apply stored related-party pack (or empty) onto a report. */
export function withRelatedPartyOverlay(report: PipelineReportLike): ReturnType<
  typeof applyRelatedPartyToReport
> {
  const agencyId = report.agency?.id || '';
  const pack = agencyId ? loadRelatedPartyPack(agencyId) : null;
  return applyRelatedPartyToReport(report, pack);
}

export function getOrEmptyRelatedPack(agencyId: string): RelatedPartyPack {
  return loadRelatedPartyPack(agencyId) || emptyRelatedPack(agencyId);
}
