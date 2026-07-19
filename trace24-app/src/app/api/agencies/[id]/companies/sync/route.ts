import { adminUnauthorizedResponse, assertAdminWrite } from '@/lib/admin-auth';
import { isRealAgency } from '@/lib/agencies';
import {
  enrichRelatedPackFromCompanyMaster,
  seedPackCompaniesFromReport,
  syncRelatedCompaniesToMaster,
} from '@/lib/companies/bridge';
import { companyMasterStats } from '@/lib/companies/store';
import {
  getOrEmptyRelatedPack,
  saveRelatedPartyPack,
} from '@/lib/pipeline/related-party-store';
import { resolveAgencyReport } from '@/lib/pipeline/resolve-report';

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Seed/sync this agency's winner TINs into the Open-DBD company master
 * and refresh the related pack from master.
 */
export async function POST(req: Request, ctx: Ctx) {
  const gate = assertAdminWrite(req);
  if (!gate.ok) return adminUnauthorizedResponse(gate);

  const { id } = await ctx.params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const report = await resolveAgencyReport(id, { fetchContracts: true });
  let pack = getOrEmptyRelatedPack(id);
  pack = seedPackCompaniesFromReport(pack, report);
  pack = enrichRelatedPackFromCompanyMaster(pack);
  const synced = syncRelatedCompaniesToMaster(pack);
  pack = saveRelatedPartyPack(id, {
    ...pack,
    note: [
      pack.note,
      `sync company master ${new Date().toISOString()} · ${synced} TIN`,
    ]
      .filter(Boolean)
      .join(' · '),
  });

  return Response.json({
    ok: true,
    agencyId: id,
    pack,
    companiesInPack: pack.companies.length,
    companyMasterSynced: synced,
    companyMaster: companyMasterStats(),
    strategy:
      'Open-DBD: TIN PK from contracts → master → related pack. BDEX later for official verify.',
  });
}
