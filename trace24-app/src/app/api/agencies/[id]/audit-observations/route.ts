import { isRealAgency } from '@/lib/agencies';
import { enrichObservationPackWithAi } from '@/lib/audit/observation-ai';
import { buildAuditObservationHtml } from '@/lib/audit/observation-html';
import { buildAuditObservationPack } from '@/lib/audit/observation-pack';
import { resolveAgencyReport } from '@/lib/pipeline/resolve-report';

export const maxDuration = 90;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  try {
    const report = await resolveAgencyReport(id);
    if (!report) {
      return Response.json(
        {
          error: 'ยังสร้างรายงานหน่วยงานไม่ได้',
          hint: 'ต้องมีแคตตาล็อกหรือ contracts-cache',
        },
        { status: 503 }
      );
    }

    let pack = buildAuditObservationPack(id, report);
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get('format') || 'json').toLowerCase();
    const useAi =
      searchParams.get('ai') === '1' ||
      searchParams.get('ai') === 'true' ||
      searchParams.get('explain') === '1';

    if (useAi) {
      pack = await enrichObservationPackWithAi(pack);
    }

    if (format === 'html') {
      return new Response(buildAuditObservationHtml(pack), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    return Response.json(pack);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'audit observations failed' },
      { status: 500 }
    );
  }
}
