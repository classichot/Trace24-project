import 'server-only';

import fs from 'fs';
import path from 'path';
import {
  enrichRelatedPackFromCompanyMaster,
  seedPackCompaniesFromReport,
} from '@/lib/companies/bridge';
import {
  applyRelatedPartyToReport,
  emptyRelatedPack,
  type RelatedPartyPack,
} from './related-party';
import type { PipelineReportLike } from './types';

function isServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function committedDir() {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'related');
}

/** Vercel/Lambda can only write under /tmp. */
function writableDir() {
  if (isServerless()) return path.join('/tmp', 'trace24-related');
  return committedDir();
}

function relatedFile(dir: string, agencyId: string) {
  const safe = agencyId.replace(/[^a-zA-Z0-9._\-ก-๙]/g, '_');
  return path.join(dir, `${safe}.json`);
}

function readPackFile(file: string): RelatedPartyPack | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as RelatedPartyPack;
  } catch {
    return null;
  }
}

export function loadRelatedPartyPack(agencyId: string): RelatedPartyPack | null {
  if (!agencyId) return null;
  // Prefer instance-local writes (auto-fetch in this warm lambda)
  const fromWritable = readPackFile(relatedFile(writableDir(), agencyId));
  if (fromWritable) return fromWritable;
  // Committed packs shipped with the deploy
  return readPackFile(relatedFile(committedDir(), agencyId));
}

export function saveRelatedPartyPack(agencyId: string, pack: RelatedPartyPack): RelatedPartyPack {
  const next: RelatedPartyPack = {
    ...pack,
    agencyId,
    updatedAt: new Date().toISOString(),
    executives: pack.executives || [],
    companies: pack.companies || [],
    transparency: pack.transparency,
  };
  const dir = writableDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(relatedFile(dir, agencyId), JSON.stringify(next, null, 2), 'utf8');

  // Also try committed path in local/dev so batch + git can pick it up
  if (!isServerless()) {
    try {
      const committed = committedDir();
      fs.mkdirSync(committed, { recursive: true });
      fs.writeFileSync(relatedFile(committed, agencyId), JSON.stringify(next, null, 2), 'utf8');
    } catch {
      /* ignore */
    }
  }
  return next;
}

/** Apply company master (TIN) + related-party pack onto a report. */
export function withRelatedPartyOverlay(report: PipelineReportLike): ReturnType<
  typeof applyRelatedPartyToReport
> {
  const agencyId = report.agency?.id || '';
  let pack = agencyId ? loadRelatedPartyPack(agencyId) : null;
  if (!pack && agencyId) pack = emptyRelatedPack(agencyId);
  if (pack) {
    pack = seedPackCompaniesFromReport(pack, report);
    pack = enrichRelatedPackFromCompanyMaster(pack);
  }
  return applyRelatedPartyToReport(report, pack);
}

export function getOrEmptyRelatedPack(agencyId: string): RelatedPartyPack {
  return loadRelatedPartyPack(agencyId) || emptyRelatedPack(agencyId);
}
