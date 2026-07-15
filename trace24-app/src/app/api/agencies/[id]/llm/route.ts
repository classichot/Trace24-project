import { isRealAgency } from '@/lib/agencies';
import {
  proposeRulesWithLlm,
  refineBriefWithLlm,
  reviewSignalsWithLlm,
  synthesizeRagWithLlm,
  llmStatus,
} from '@/lib/llm';
import { proposeAndPersistRules } from '@/lib/pipeline/rules';
import { buildInvestigationPack } from '@/lib/pipeline/investigate';
import { resolveAgencyReport } from '@/lib/pipeline/resolve-report';
import { hybridGraphRag } from '@/lib/pipeline/rag';

export const maxDuration = 60;

type Action = 'status' | 'rag' | 'review-signals' | 'propose-rules' | 'refine-brief';

export async function GET() {
  return Response.json(llmStatus());
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: Action;
    query?: string;
    useLlm?: boolean;
    rebuildIndex?: boolean;
    persist?: boolean;
  };
  const action = body.action || 'status';

  if (action === 'status') {
    return Response.json(llmStatus());
  }

  // Same resolver as RAG / investigate — catalog agencies use live report + contracts-cache
  const report = await resolveAgencyReport(id);
  if (!report) {
    return Response.json(
      {
        error: 'ยังสร้างรายงานหน่วยงานไม่ได้',
        hint: 'สแกนหน่วยงานก่อน หรือตรวจว่ามีในแคตตาล็อก / contracts-cache',
      },
      { status: 503 }
    );
  }

  const pack = buildInvestigationPack(id, report);

  if (action === 'rag') {
    const query = (body.query || '').trim();
    if (query.length < 2) {
      return Response.json({ error: 'query required' }, { status: 400 });
    }
    const rag = hybridGraphRag(id, report, query, { rebuildIndex: !!body.rebuildIndex });
    if (body.useLlm === false) {
      return Response.json({ ...rag, llm: null });
    }
    const llm = await synthesizeRagWithLlm(rag);
    if ('error' in llm) {
      return Response.json({ ...rag, llm: null, llmError: llm.error });
    }
    return Response.json({
      ...rag,
      answer: llm.answer,
      mode: llm.mode,
      llm: { model: llm.model, mode: llm.mode },
      extractiveAnswer: rag.answer,
    });
  }

  if (action === 'review-signals') {
    const out = await reviewSignalsWithLlm(pack);
    if ('error' in out) return Response.json({ error: out.error }, { status: 502 });
    return Response.json({ agencyId: id, ...out });
  }

  if (action === 'propose-rules') {
    const out = await proposeAndPersistRules(pack, { persist: body.persist !== false });
    if ('error' in out) {
      const legacy = await proposeRulesWithLlm(pack);
      if ('error' in legacy) return Response.json({ error: out.error }, { status: 502 });
      return Response.json({ agencyId: id, persisted: false, ...legacy });
    }
    return Response.json({ agencyId: id, persisted: true, ...out });
  }

  if (action === 'refine-brief') {
    const out = await refineBriefWithLlm(pack, report);
    if ('error' in out) return Response.json({ error: out.error }, { status: 502 });
    return Response.json({ agencyId: id, caseBrief: pack.caseBrief, ...out });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
