import { buildOrgQueue } from '@/lib/org/overview';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const data = buildOrgQueue({
    status: searchParams.get('status') || undefined,
    assignee: searchParams.get('assignee') || undefined,
    province: searchParams.get('province') || undefined,
    priority: searchParams.get('priority') || undefined,
  });
  return Response.json(data);
}
