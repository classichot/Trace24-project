import { adminUnauthorizedResponse, assertAdminWrite } from '@/lib/admin-auth';
import { isRealAgency } from '@/lib/agencies';
import { fetchCompanyAgesForAgency, mergeCompanyDrafts } from '@/lib/pipeline/fetch-company-age';
import { resolveAgencyReport } from '@/lib/pipeline/resolve-report';
import { getOrEmptyRelatedPack } from '@/lib/pipeline/related-party-store';

export const maxDuration = 120;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = assertAdminWrite(req);
  if (!gate.ok) return adminUnauthorizedResponse(gate);

  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    merge?: boolean;
    limit?: number;
  };

  const report = await resolveAgencyReport(id, { fetchContracts: true });
  if (!report) {
    return Response.json({ error: 'Agency report unavailable' }, { status: 503 });
  }

  const pack = getOrEmptyRelatedPack(id);
  const result = await fetchCompanyAgesForAgency({
    report,
    limit: body.limit || 6,
  });

  const companies =
    body.merge === false
      ? result.companies
      : mergeCompanyDrafts(pack.companies, result.companies);

  const draftPack = {
    ...pack,
    agencyId: id,
    updatedAt: new Date().toISOString(),
    companies,
    note: result.note,
  };

  return Response.json({
    ok: result.ok,
    draftPack,
    companies: result.companies,
    winners: result.winners,
    sources: result.sources,
    model: result.model,
    note: result.note,
    error: result.error,
    ethics:
      'วันที่จากเว็บ/ข่าวเป็น draft ประมาณการ — ไม่ใช่วันจดทะเบียน DBD โดยตรง · ตรวจแก้ก่อนบันทึก · ใช้กับ R18 เป็นหลักฐานเสริม',
  });
}
