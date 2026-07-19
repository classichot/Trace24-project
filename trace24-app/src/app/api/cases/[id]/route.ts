import { getCase, patchCase } from '@/lib/cases/store';
import type { CasePriority, CaseStatus } from '@/lib/cases/types';

type Ctx = { params: Promise<{ id: string }> };

/** Case read/update — demo login gate only (see middleware). */

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = getCase(id);
  if (!c) return Response.json({ error: 'case not found' }, { status: 404 });
  return Response.json({ case: c });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    status?: CaseStatus;
    priority?: CasePriority;
    assignee?: string;
    title?: string;
    summary?: string;
    projectIds?: string[];
    signalTags?: string[];
    missingDocuments?: string[];
    score100?: number | null;
    note?: { by?: string; text: string };
  };

  try {
    const updated = patchCase(id, body);
    if (!updated) return Response.json({ error: 'case not found' }, { status: 404 });
    return Response.json({ ok: true, case: updated });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'patch failed' },
      { status: 400 }
    );
  }
}
