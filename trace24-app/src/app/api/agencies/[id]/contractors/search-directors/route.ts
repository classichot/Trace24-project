import { assertAdminWrite } from '@/lib/admin-auth';
import { isRealAgency } from '@/lib/agencies';
import { searchDirectorsForCompany } from '@/lib/pipeline/search-directors';
import { resolveAgencyReport } from '@/lib/pipeline/resolve-report';

export const maxDuration = 90;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    contractorId?: string;
    tin?: string;
    name?: string;
    persist?: boolean;
  };

  let name = String(body.name || '').trim();
  let tin = String(body.tin || '').replace(/\D/g, '');

  if (body.contractorId || (!name && !tin)) {
    const report = await resolveAgencyReport(id, { fetchContracts: false });
    const contractors = (report?.contractors || {}) as Record<
      string,
      { name?: string; reg?: string }
    >;
    const co = body.contractorId ? contractors[body.contractorId] : undefined;
    if (co) {
      if (!name) name = String(co.name || '').trim();
      if (!tin) tin = String(co.reg || '').replace(/\D/g, '');
    }
  }

  const wantPersist = body.persist !== false;
  let persist = false;
  if (wantPersist) {
    const gate = assertAdminWrite(req);
    if (gate.ok) persist = true;
    // Search still allowed without admin — just skip write
  }

  const result = await searchDirectorsForCompany({
    companyName: name,
    tin,
    agencyId: id,
    persist,
  });

  return Response.json({
    ...result,
    persistSkipped: wantPersist && !persist,
    persistHint:
      wantPersist && !persist
        ? 'ค้นหาสำเร็จแต่ยังไม่บันทึก — ใส่ Admin token เพื่อบันทึกลง company master / ความเชื่อมโยง'
        : undefined,
  });
}
