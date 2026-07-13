import { isRealAgency } from '@/lib/agencies';
import { synthesizeRagWithLlm } from '@/lib/llm';
import { hybridGraphRag } from '@/lib/pipeline/rag';
import { resolveAgencyReport } from '@/lib/pipeline/resolve-report';

export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }
  const report = await resolveAgencyReport(id);
  if (!report) {
    return Response.json({ error: 'ยังสร้างรายงานหน่วยงานไม่ได้' }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    query?: string;
    rebuildIndex?: boolean;
    useLlm?: boolean;
  };
  const query = (body.query || '').trim();
  if (query.length < 2) {
    return Response.json({ error: 'query required' }, { status: 400 });
  }
  const result = hybridGraphRag(id, report, query, {
    rebuildIndex: !!body.rebuildIndex,
  });

  // Default: use LLM when configured (useLlm: false to force extractive-only)
  if (body.useLlm === false) {
    return Response.json(result);
  }

  const llm = await synthesizeRagWithLlm(result);
  if ('error' in llm) {
    return Response.json({ ...result, llmError: llm.error });
  }

  return Response.json({
    ...result,
    answer: llm.answer,
    mode: llm.mode,
    llm: { model: llm.model },
    extractiveAnswer: result.answer,
  });
}
