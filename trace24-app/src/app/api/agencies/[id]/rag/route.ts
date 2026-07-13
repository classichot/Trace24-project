import { isRealAgency } from '@/lib/agencies';
import { loadAgencyReport } from '@/lib/pipeline/load-report';
import { hybridGraphRag } from '@/lib/pipeline/rag';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }
  const report = loadAgencyReport(id);
  if (!report) {
    return Response.json({ error: 'Real data not cached' }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    query?: string;
    rebuildIndex?: boolean;
  };
  const query = (body.query || '').trim();
  if (query.length < 2) {
    return Response.json({ error: 'query required' }, { status: 400 });
  }
  const result = hybridGraphRag(id, report, query, {
    rebuildIndex: !!body.rebuildIndex,
  });
  return Response.json(result);
}
