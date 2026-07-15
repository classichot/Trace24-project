import { isRealAgency } from '@/lib/agencies';
import {
  PUBLIC_SOURCE_DISCLAIMER,
  extractDirectorsFromPaste,
  fetchDirectorsForAgency,
  mergeCompanyDrafts,
} from '@/lib/pipeline/fetch-directors';
import { resolveAgencyReport } from '@/lib/pipeline/resolve-report';
import { getOrEmptyRelatedPack } from '@/lib/pipeline/related-party-store';

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
    merge?: boolean;
    limit?: number;
    pasteText?: string;
    pasteTin?: string;
    pasteName?: string;
    extraTins?: { tin: string; name?: string }[];
  };

  const pack = getOrEmptyRelatedPack(id);

  // Mode A: paste public-source / บอจ.5 text for one company
  if (body.pasteText && body.pasteText.trim().length >= 40) {
    const result = await extractDirectorsFromPaste({
      companyName: body.pasteName || body.pasteTin || 'นิติบุคคลจากแหล่งสาธารณะ',
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
      note: `${result.note} · ${PUBLIC_SOURCE_DISCLAIMER}`,
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
      disclaimer: PUBLIC_SOURCE_DISCLAIMER,
      ethics: PUBLIC_SOURCE_DISCLAIMER,
    });
  }

  // Mode B: winners from report — DataForThai → Creden → e-GP/docs → DBD
  const report = await resolveAgencyReport(id, { fetchContracts: true });
  if (!report) {
    return Response.json({ error: 'Agency report unavailable' }, { status: 503 });
  }

  const result = await fetchDirectorsForAgency({
    report,
    limit: body.limit || 8,
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
    disclaimer: result.disclaimer,
    ethics: PUBLIC_SOURCE_DISCLAIMER,
  });
}
