import { adminUnauthorizedResponse, assertAdminWrite } from '@/lib/admin-auth';
import { isRealAgency } from '@/lib/agencies';
import {
  dashboardBriefWithLlm,
  draftDocumentRequestWithLlm,
  explainSignalWithLlm,
  extractAnnounceWithLlm,
  graphStoryWithLlm,
  peerNarrativeWithLlm,
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
import { candidateAnnounceUrls } from '@/lib/pipeline/announce-enrich';
import { fetchAnnouncePlain } from '@/lib/pipeline/announce-fallback';
import { buildPriceComparePayload } from '@/lib/llm/price-compare';

export const maxDuration = 60;

type Action =
  | 'status'
  | 'rag'
  | 'review-signals'
  | 'propose-rules'
  | 'refine-brief'
  | 'dashboard-brief'
  | 'explain-signal'
  | 'draft-request'
  | 'extract-announce'
  | 'graph-story'
  | 'peer-narrative';

export async function GET() {
  return Response.json({
    ...llmStatus(),
    actions: [
      'rag',
      'review-signals',
      'propose-rules',
      'refine-brief',
      'dashboard-brief',
      'explain-signal',
      'draft-request',
      'extract-announce',
      'graph-story',
      'peer-narrative',
      'price-compare',
    ],
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

  const body = (await req.json().catch(() => ({}))) as {
    action?: Action;
    query?: string;
    useLlm?: boolean;
    rebuildIndex?: boolean;
    persist?: boolean;
    signal?: {
      ruleId?: string;
      title?: string;
      explanation?: string;
      severity?: string;
      matchType?: string;
      projectName?: string;
    };
    node?: { typeLabel?: string; label?: string; sub?: string; facts?: string[] };
    connections?: { label: string; rel: string }[];
    projectId?: string;
    url?: string;
  };
  const action = body.action || 'status';

  if (action === 'status') {
    return Response.json(llmStatus());
  }

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
  const status = llmStatus();
  if (!status.enabled && action !== 'rag') {
    return Response.json({ error: 'llm_disabled', hint: status.note }, { status: 503 });
  }

  if (action === 'rag') {
    const query = (body.query || '').trim();
    if (query.length < 2) {
      return Response.json({ error: 'query required' }, { status: 400 });
    }
    const rag = hybridGraphRag(id, report, query, { rebuildIndex: !!body.rebuildIndex });
    if (body.useLlm === false || !status.enabled) {
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
    const persist = body.persist !== false;
    if (persist) {
      const gate = assertAdminWrite(req);
      if (!gate.ok) return adminUnauthorizedResponse(gate);
    }
    const out = await proposeAndPersistRules(pack, { persist });
    if ('error' in out) {
      const legacy = await proposeRulesWithLlm(pack);
      if ('error' in legacy) return Response.json({ error: out.error }, { status: 502 });
      return Response.json({ agencyId: id, persisted: false, ...legacy });
    }
    return Response.json({ agencyId: id, persisted: persist, ...out });
  }

  if (action === 'refine-brief') {
    const out = await refineBriefWithLlm(pack, report);
    if ('error' in out) return Response.json({ error: out.error }, { status: 502 });
    return Response.json({ agencyId: id, caseBrief: pack.caseBrief, ...out });
  }

  if (action === 'dashboard-brief') {
    const out = await dashboardBriefWithLlm(pack, report);
    if ('error' in out) return Response.json({ error: out.error }, { status: 502 });
    return Response.json({ agencyId: id, ...out });
  }

  if (action === 'explain-signal') {
    const signal = body.signal;
    if (!signal?.title && !signal?.ruleId && !signal?.explanation) {
      return Response.json({ error: 'signal required' }, { status: 400 });
    }
    const out = await explainSignalWithLlm({
      agencyName: report.agency?.th,
      signal,
      pack,
    });
    if ('error' in out) return Response.json({ error: out.error }, { status: 502 });
    return Response.json({ agencyId: id, ...out });
  }

  if (action === 'draft-request') {
    const out = await draftDocumentRequestWithLlm(pack, report);
    if ('error' in out) return Response.json({ error: out.error }, { status: 502 });
    return Response.json({ agencyId: id, ...out });
  }

  if (action === 'extract-announce') {
    const projectId = (body.projectId || '').trim();
    const project = projectId ? report.projects?.[projectId] : null;
    let url = (body.url || '').trim();
    if (!url && project) {
      const urls = candidateAnnounceUrls(project);
      url = urls[0] || '';
    }
    if (!url) {
      return Response.json(
        { error: 'url or projectId with announce link required' },
        { status: 400 }
      );
    }
    try {
      const plain = await fetchAnnouncePlain(url);
      if (!plain || plain.length < 40) {
        return Response.json(
          { error: 'fetch_empty', hint: 'ดึงข้อความประกาศไม่ได้ หรือหน้าว่าง', url },
          { status: 502 }
        );
      }
      const out = await extractAnnounceWithLlm(plain, {
        url,
        projectName: project?.name,
        projectCode: project?.code,
      });
      if ('error' in out) return Response.json({ error: out.error, url }, { status: 502 });
      return Response.json({
        agencyId: id,
        url,
        plainPreview: plain.slice(0, 400),
        ...out,
      });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : 'announce fetch failed', url },
        { status: 502 }
      );
    }
  }

  if (action === 'graph-story') {
    if (!body.node?.label) {
      return Response.json({ error: 'node required' }, { status: 400 });
    }
    const out = await graphStoryWithLlm({
      agencyName: report.agency?.th,
      node: body.node,
      connections: body.connections || [],
      relatedMatches: (report.relatedParty?.matches || []).slice(0, 6),
    });
    if ('error' in out) return Response.json({ error: out.error }, { status: 502 });
    return Response.json({ agencyId: id, ...out });
  }

  if (action === 'peer-narrative') {
    const projectId = (body.projectId || '').trim();
    if (!projectId) {
      return Response.json({ error: 'projectId required' }, { status: 400 });
    }
    const payload = buildPriceComparePayload(id, report, projectId);
    if ('error' in payload) {
      return Response.json({ error: payload.error }, { status: 404 });
    }
    const out = await peerNarrativeWithLlm({
      agencyName: report.agency?.th,
      project: {
        name: payload.project.name,
        award: String(payload.project.award ?? ''),
        budget: String(payload.project.budget ?? ''),
        method: payload.project.method,
        winner: payload.project.winnerName,
        year: payload.project.fy,
      },
      benchmark: payload.benchmark
        ? {
            median: payload.benchmark.median,
            scope: payload.benchmark.scope,
            n: payload.benchmark.n,
            note: payload.benchmark.note,
            compareMode: payload.benchmark.compareMode,
          }
        : null,
      peers: payload.peers.slice(0, 6).map((p) => ({
        name: p.name,
        award: String(p.award ?? ''),
        agency: report.agency?.th,
      })),
    });
    if ('error' in out) return Response.json({ error: out.error }, { status: 502 });
    return Response.json({ agencyId: id, projectId, ...out });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
