import { getCatalogAgency } from '@/lib/agency-catalog';
import { isRealAgency, REAL_AGENCIES } from '@/lib/agencies';
import { buildAgencyReportFromCatalog } from '@/lib/pipeline/live-report';
import { loadAgencyReport } from '@/lib/pipeline/load-report';
import {
  applyRelatedPartyToReport,
  detectRelatedPartyMatches,
  emptyRelatedPack,
  type RelatedPartyPack,
} from '@/lib/pipeline/related-party';
import {
  getOrEmptyRelatedPack,
  saveRelatedPartyPack,
  withRelatedPartyOverlay,
} from '@/lib/pipeline/related-party-store';
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
  let report: PipelineReportLike | null = loadAgencyReport(id);
  if (!report) {
    const agency = getCatalogAgency(id) || REAL_AGENCIES.find((a) => a.id === id);
    if (agency) {
      const live = (await buildAgencyReportFromCatalog(agency, {
        fetchContracts: true,
        limit: 40,
      })) as unknown as PipelineReportLike;
      report = withRelatedPartyOverlay(live);
    }
  }

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
    ethics:
      'นามสกุลหรือชื่อตรงกันเป็นเพียง lead ให้สอบสวน — ไม่ใช่ข้อพิสูจน์ความเกี่ยวข้องหรือการทุจริต',
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  let report: PipelineReportLike | null = loadAgencyReport(id);
  if (!report) {
    const agency = getCatalogAgency(id) || REAL_AGENCIES.find((a) => a.id === id);
    if (agency) {
      const live = (await buildAgencyReportFromCatalog(agency, {
        fetchContracts: true,
        limit: 40,
      })) as unknown as PipelineReportLike;
      report = applyRelatedPartyToReport(live, pack);
    }
  }

  const matches = report ? detectRelatedPartyMatches(report) : [];

  return Response.json({
    ok: true,
    pack,
    matches,
    ethics:
      'บันทึกแล้ว — สแกนหน่วยงานใหม่เพื่อให้แดชบอร์ดและกราฟสะท้อนสัญญาณ R5/R13',
  });
}
