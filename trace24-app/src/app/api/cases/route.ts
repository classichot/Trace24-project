import { createCase, listCases } from '@/lib/cases/store';
import type { CasePriority } from '@/lib/cases/types';

/** Case create/list — protected by demo login gate (middleware), not Admin token.
 *  Admin token remains for related-party / rules writes only. */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const agencyId = searchParams.get('agencyId') || '';
  const status = searchParams.get('status') || '';
  let cases = listCases();
  if (agencyId) cases = cases.filter((c) => c.agencyId === agencyId);
  if (status) cases = cases.filter((c) => c.status === status);
  return Response.json({ generatedAt: new Date().toISOString(), cases, count: cases.length });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    agencyId?: string;
    agencyName?: string;
    province?: string;
    agencyType?: string;
    title?: string;
    summary?: string;
    priority?: CasePriority;
    assignee?: string;
    openedBy?: string;
    projectIds?: string[];
    signalTags?: string[];
    missingDocuments?: string[];
    score100?: number | null;
  };

  if (!body.agencyId?.trim()) {
    return Response.json({ error: 'agencyId required' }, { status: 400 });
  }

  const created = createCase({
    agencyId: body.agencyId.trim(),
    agencyName: body.agencyName || body.agencyId,
    province: body.province,
    agencyType: body.agencyType,
    title: body.title,
    summary: body.summary,
    priority: body.priority,
    assignee: body.assignee,
    openedBy: body.openedBy,
    projectIds: body.projectIds,
    signalTags: body.signalTags,
    missingDocuments: body.missingDocuments,
    score100: body.score100,
  });

  return Response.json({ ok: true, case: created }, { status: 201 });
}
