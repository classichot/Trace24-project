import { isRealAgency } from '@/lib/agencies';
import { llmStatus } from '@/lib/llm';
import { buildPriceComparePayload, comparePriceWithLlm } from '@/lib/llm/price-compare';
import { resolveAgencyReport } from '@/lib/pipeline/resolve-report';
import { SERVICE_SIMILARITY_THRESHOLD } from '@/lib/title-similarity';

export const maxDuration = 60;

export async function GET() {
  return Response.json({
    ...llmStatus(),
    action: 'price-compare',
    body: { projectId: 'string (required)' },
    note: 'AI อ่านโครงการ + ค่ากลางตลาด + peer ในหน่วยงาน แล้วสรุปเปรียบเทียบละเอียด — ไม่เปลี่ยนคะแนนความเสี่ยง',
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const status = llmStatus();
  if (!status.enabled) {
    return Response.json(
      {
        error: 'llm_disabled',
        hint: status.note,
      },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { projectId?: string };
  const projectId = (body.projectId || '').trim();
  if (!projectId) {
    return Response.json({ error: 'projectId required' }, { status: 400 });
  }

  const report = await resolveAgencyReport(id, { fetchContracts: true });
  if (!report) {
    return Response.json({ error: 'Agency report unavailable' }, { status: 503 });
  }

  const payload = buildPriceComparePayload(id, report, projectId);
  if ('error' in payload) {
    return Response.json(
      { error: payload.error, hint: 'เลือกโครงการที่มีในรายงานหน่วยงานนี้' },
      { status: 404 }
    );
  }

  const out = await comparePriceWithLlm(payload);
  if ('error' in out) {
    return Response.json({ error: out.error }, { status: 502 });
  }

  return Response.json({
    agencyId: id,
    projectId,
    evidence: {
      benchmark: payload.benchmark,
      quantity: payload.project.quantity,
      peerCount: payload.peers.length,
      peers: payload.peers.map((p) => ({
        id: p.id,
        name: p.name,
        award: p.award,
        pct: p.pct,
        lengthKm: p.lengthKm,
        unitRateLabel: p.unitRateLabel,
        similarity: p.similarity,
      })),
      peerRule: `งานคล้ายเท่านั้น · similarity > ${Math.round(SERVICE_SIMILARITY_THRESHOLD * 100)}% (ไม่ใช้ทั้งหมวด)`,
    },
    ...out,
  });
}
