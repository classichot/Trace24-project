import { adminUnauthorizedResponse, assertAdminWrite } from '@/lib/admin-auth';
import { isRealAgency } from '@/lib/agencies';
import {
  applyRelatedPartyToReport,
  detectRelatedPartyMatches,
  emptyRelatedPack,
  type RelatedPartyPack,
} from '@/lib/pipeline/related-party';
import { syncRelatedCompaniesToMaster } from '@/lib/companies/bridge';
import { companyMasterStats } from '@/lib/companies/store';
import {
  getOrEmptyRelatedPack,
  saveRelatedPartyPack,
} from '@/lib/pipeline/related-party-store';
import { resolveAgencyReport } from '@/lib/pipeline/resolve-report';
import type { PipelineReportLike } from '@/lib/pipeline/types';

export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const pack = getOrEmptyRelatedPack(id);
  const report = (await resolveAgencyReport(id)) as PipelineReportLike | null;

  const matches = report
    ? detectRelatedPartyMatches(report)
    : detectRelatedPartyMatches(
        applyRelatedPartyToReport({ agency: { id }, contractors: {}, projects: {} }, pack),
        null
      );

  return Response.json({
    pack,
    matches,
    coverage: report
      ? (report as { relatedParty?: { coverage: string } }).relatedParty?.coverage ||
        'พร้อมตรวจเมื่อมีทำเนียบ + กรรมการ'
      : 'ยังไม่มีรายงานหน่วยงาน — บันทึกทำเนียบได้ก่อนแล้วค่อยสแกน',
    dbdHint: 'https://data.dbd.go.th/',
    companyMaster: companyMasterStats(),
    strategy:
      'Open-DBD: เลขนิติบุคคลเป็น PK → เชื่อมจัดซื้อจัดจ้าง → ACT AI · BDEX API เป็นขั้นถัดไป · ไม่ scrape DBD DataWarehouse เป็นหลัก',
    ethics:
      'นามสกุลร่วมเป็น lead ให้สอบสวนเท่านั้น — ไม่ใช่ข้อพิสูจน์เครือญาติหรือการทุจริต · ชื่อเต็มยกระดับความมั่นใจ',
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = assertAdminWrite(req);
  if (!gate.ok) return adminUnauthorizedResponse(gate);

  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const body = (await req.json()) as Partial<RelatedPartyPack>;
  const base = emptyRelatedPack(id);
  const pack = saveRelatedPartyPack(id, {
    ...base,
    ...body,
    agencyId: id,
    executives: body.executives || [],
    companies: body.companies || [],
    note: body.note || base.note,
  });

  const synced = syncRelatedCompaniesToMaster(pack);

  const baseReport = await resolveAgencyReport(id);
  const report = baseReport ? applyRelatedPartyToReport(baseReport, pack) : null;
  const matches = report ? detectRelatedPartyMatches(report) : [];

  return Response.json({
    ok: true,
    pack,
    matches,
    companyMasterSynced: synced,
    companyMaster: companyMasterStats(),
    ethics:
      'บันทึกแล้ว — sync เข้า company master (TIN) แล้ว · สแกนหน่วยงานใหม่เพื่อให้แดชบอร์ดสะท้อน R5/R13',
  });
}
