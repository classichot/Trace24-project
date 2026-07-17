import { buildOrgOverview } from '@/lib/org/overview';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const province = searchParams.get('province') || undefined;
  const limit = Number(searchParams.get('limit') || '40') || 40;
  return Response.json(buildOrgOverview({ province, limit }));
}
