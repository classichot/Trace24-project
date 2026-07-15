import { adminUnauthorizedResponse, assertAdminWrite } from '@/lib/admin-auth';
import { getProposal, updateProposalStatus } from '@/lib/pipeline/rules';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const proposal = getProposal(id);
  if (!proposal) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(proposal);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = assertAdminWrite(req);
  if (!gate.ok) return adminUnauthorizedResponse(gate);

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    status?: 'approved' | 'rejected';
    by?: string;
    reason?: string;
  };
  if (body.status !== 'approved' && body.status !== 'rejected') {
    return Response.json({ error: 'status must be approved|rejected' }, { status: 400 });
  }
  const updated = updateProposalStatus(id, body.status, {
    by: body.by || 'admin',
    reason: body.reason,
  });
  if (!updated) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ ok: true, proposal: updated });
}
