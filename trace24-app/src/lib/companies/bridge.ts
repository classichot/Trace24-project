import 'server-only';

import type { RelatedCompanyRecord, RelatedPartyPack } from '@/lib/pipeline/related-party';
import type { PipelineReportLike } from '@/lib/pipeline/types';
import { loadCompany, upsertCompany } from './store';
import type { CompanyMasterRecord, CompanySourceKind } from './types';
import { normalizeTin } from './types';

export function companyToRelated(c: CompanyMasterRecord): RelatedCompanyRecord {
  return {
    tin: c.tin,
    name: c.name,
    address: c.address,
    directors: c.directors || [],
    sourceUrl: c.sources.find((s) => s.url)?.url || c.registeredAtSourceUrl,
    fetchedAt: c.updatedAt,
    registeredAt: c.registeredAt,
    registeredAtPrecision: c.registeredAtPrecision,
    registeredAtSource: c.registeredAtSource,
    registeredAtSourceUrl: c.registeredAtSourceUrl,
    registeredAtQuote: c.registeredAtQuote,
    registeredAtConfidence: c.registeredAtConfidence,
    registeredAtNote: c.registeredAtNote,
    registeredCapital: c.registeredCapital,
  };
}

export function relatedToUpsert(
  co: RelatedCompanyRecord,
  opts?: { agencyId?: string; sourceKind?: CompanySourceKind }
) {
  const tin = normalizeTin(co.tin);
  if (!tin) return null;
  return upsertCompany({
    tin,
    name: co.name,
    address: co.address,
    directors: co.directors,
    registeredAt: co.registeredAt,
    registeredAtPrecision: co.registeredAtPrecision,
    registeredAtSource: co.registeredAtSource,
    registeredAtSourceUrl: co.registeredAtSourceUrl,
    registeredAtQuote: co.registeredAtQuote,
    registeredAtConfidence: co.registeredAtConfidence,
    registeredAtNote: co.registeredAtNote,
    registeredCapital: co.registeredCapital,
    seenAgencyIds: opts?.agencyId ? [opts.agencyId] : [],
    sources: [
      {
        kind: opts?.sourceKind || 'related-pack',
        url: co.sourceUrl,
        fetchedAt: co.fetchedAt || new Date().toISOString(),
      },
    ],
    confidence: 'open_dbd',
  });
}

/** Merge company-master records into a related pack by TIN (master fills gaps). */
export function enrichRelatedPackFromCompanyMaster(pack: RelatedPartyPack): RelatedPartyPack {
  const companies = [...(pack.companies || [])];
  const byTin = new Map<string, number>();
  companies.forEach((c, i) => {
    const tin = normalizeTin(c.tin);
    if (tin) byTin.set(tin, i);
  });

  // Pull master for every TIN already in pack
  for (const [tin, idx] of byTin) {
    const master = loadCompany(tin);
    if (!master) continue;
    const cur = companies[idx];
    const fromMaster = companyToRelated(master);
    companies[idx] = {
      ...fromMaster,
      ...cur,
      tin,
      name: cur.name || fromMaster.name,
      address: cur.address || fromMaster.address,
      directors:
        cur.directors?.length > 0 ? cur.directors : fromMaster.directors || [],
      registeredAt: cur.registeredAt || fromMaster.registeredAt,
      registeredAtPrecision: cur.registeredAtPrecision || fromMaster.registeredAtPrecision,
      registeredAtSource: cur.registeredAtSource || fromMaster.registeredAtSource,
      registeredAtSourceUrl: cur.registeredAtSourceUrl || fromMaster.registeredAtSourceUrl,
      registeredAtQuote: cur.registeredAtQuote || fromMaster.registeredAtQuote,
      registeredAtConfidence: cur.registeredAtConfidence || fromMaster.registeredAtConfidence,
      registeredAtNote: cur.registeredAtNote || fromMaster.registeredAtNote,
      registeredCapital:
        cur.registeredCapital != null ? cur.registeredCapital : fromMaster.registeredCapital,
      sourceUrl: cur.sourceUrl || fromMaster.sourceUrl,
    };
  }

  return { ...pack, companies };
}

/** Seed pack companies from report contractor TINs + company master. */
export function seedPackCompaniesFromReport(
  pack: RelatedPartyPack,
  report: PipelineReportLike | null
): RelatedPartyPack {
  if (!report?.contractors) return pack;
  const companies = [...(pack.companies || [])];
  const have = new Set(
    companies.map((c) => normalizeTin(c.tin)).filter(Boolean) as string[]
  );

  for (const co of Object.values(report.contractors)) {
    const tin = normalizeTin(co.reg);
    if (!tin || have.has(tin)) continue;
    const master = loadCompany(tin);
    if (master) {
      companies.push(companyToRelated(master));
    } else {
      companies.push({
        tin,
        name: co.name,
        directors: [],
        sourceUrl: undefined,
        fetchedAt: new Date().toISOString(),
      });
      upsertCompany({
        tin,
        name: co.name,
        seenAgencyIds: pack.agencyId ? [pack.agencyId] : [],
        contractWinCount: typeof co.contracts === 'number' ? co.contracts : 0,
        sources: [
          {
            kind: 'contracts-cache',
            fetchedAt: new Date().toISOString(),
            note: 'stub from agency report contractor.reg',
          },
        ],
        confidence: 'draft',
      });
    }
    have.add(tin);
  }

  return { ...pack, companies };
}

/** Persist related-pack companies into the TIN master. */
export function syncRelatedCompaniesToMaster(pack: RelatedPartyPack): number {
  let n = 0;
  for (const co of pack.companies || []) {
    if (relatedToUpsert(co, { agencyId: pack.agencyId, sourceKind: 'related-pack' })) n += 1;
  }
  return n;
}
