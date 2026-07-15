import { adminUnauthorizedResponse, assertAdminWrite } from '@/lib/admin-auth';
import {
  addSignalFeedback,
  feedbackSummary,
  listFeedback,
  listProposals,
  proposeAndPersistRules,
  updateProposalStatus,
} from '@/lib/pipeline/rules';
import { buildInvestigationPack } from '@/lib/pipeline/investigate';
import { resolveAgencyReport } from '@/lib/pipeline/resolve-report';
import { isRealAgency } from '@/lib/agencies';
import type { SignalFeedbackLabel } from '@/lib/pipeline/rules';

export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') as 'draft' | 'approved' | 'rejected' | null;
  const agencyId = searchParams.get('agencyId') || undefined;
  return Response.json({
    generatedAt: new Date().toISOString(),
    proposals: listProposals(status || undefined),
    feedback: listFeedback(agencyId),
    feedbackSummary: feedbackSummary(agencyId),
  });
}

export async function POST(req: Request) {
  const gate = assertAdminWrite(req);
  if (!gate.ok) return adminUnauthorizedResponse(gate);

  const body = (await req.json().catch(() => ({}))) as {
    action?: 'propose' | 'feedback' | 'approve' | 'reject';
    agencyId?: string;
    ruleId?: string;
    signalId?: string;
    label?: SignalFeedbackLabel;
    note?: string;
    by?: string;
    reason?: string;
  };

  const action = body.action || 'propose';

  if (action === 'feedback') {
    if (!body.agencyId || !body.signalId || !body.label) {
      return Response.json({ error: 'agencyId, signalId, label required' }, { status: 400 });
    }
    if (!['confirmed', 'false_positive', 'needs_data'].includes(body.label)) {
      return Response.json({ error: 'invalid label' }, { status: 400 });
    }
    const item = addSignalFeedback({
      agencyId: body.agencyId,
      signalId: body.signalId,
      ruleId: body.ruleId,
      label: body.label,
      note: body.note,
    });
    return Response.json({ ok: true, feedback: item, summary: feedbackSummary(body.agencyId) });
  }

  if (action === 'approve' || action === 'reject') {
    if (!body.ruleId) return Response.json({ error: 'ruleId required' }, { status: 400 });
    const updated = updateProposalStatus(body.ruleId, action === 'approve' ? 'approved' : 'rejected', {
      by: body.by || 'admin',
      reason: body.reason,
    });
    if (!updated) return Response.json({ error: 'rule not found' }, { status: 404 });
    return Response.json({ ok: true, proposal: updated });
  }

  // propose
  const agencyId = body.agencyId;
  if (!agencyId || !isRealAgency(agencyId)) {
    return Response.json({ error: 'valid agencyId required' }, { status: 400 });
  }
  const report = await resolveAgencyReport(agencyId);
  if (!report) {
    return Response.json(
      {
        error: 'ยังสร้างรายงานหน่วยงานไม่ได้',
        hint: 'สแกนหน่วยงานก่อน หรือตรวจว่ามีในแคตตาล็อก / contracts-cache',
      },
      { status: 503 }
    );
  }
  const pack = buildInvestigationPack(agencyId, report);
  const out = await proposeAndPersistRules(pack, { persist: true });
  if ('error' in out) return Response.json({ error: out.error }, { status: 502 });
  return Response.json({ ok: true, ...out });
}
