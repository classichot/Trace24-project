import { isRealAgency } from '@/lib/agencies';
import {
  extractDirectorsFromPaste,
  fetchDirectorsForAgency,
  mergeCompanyDrafts,
} from '@/lib/pipeline/fetch-directors';
import { resolveAgencyReport } from '@/lib/pipeline/resolve-report';
import { getOrEmptyRelatedPack } from '@/lib/pipeline/related-party-store';

export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    merge?: boolean;
    limit?: number;
    pasteText?: string;
    pasteTin?: string;
    pasteName?: string;
    extraTins?: { tin: string; name?: string }[];
  };

  const pack = getOrEmptyRelatedPack(id);

  // Mode A: paste DBD page text for one company
  if (body.pasteText && body.pasteText.trim().length >= 40) {
    const result = await extractDirectorsFromPaste({
      companyName: body.pasteName || body.pasteTin || 'นิติบุคคลจาก DBD',
      tin: body.pasteTin,
      text: body.pasteText,
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
      scrapeBlocked: false,
      ethics:
        'รายชื่อจาก DBD เป็น draft — ตรวจแก้ก่อนกดบันทึก · ไม่ใช่ข้อพิสูจน์ความเกี่ยวข้อง',
    });
  }

  // Mode B: pull winners from report + try DBD profile pages
  const report = await resolveAgencyReport(id, { fetchContracts: true });
  if (!report) {
    return Response.json({ error: 'Agency report unavailable' }, { status: 503 });
  }

  const result = await fetchDirectorsForAgency({
    report,
    limit: body.limit || 10,
    extraTins: body.extraTins,
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
    scrapeBlocked: result.scrapeBlocked,
    ethics:
      'รายชื่อจาก DBD เป็น draft — ตรวจแก้ก่อนกดบันทึก · ผู้ถือหุ้นเต็มมักอยู่ในบอจ.5',
  });
}
