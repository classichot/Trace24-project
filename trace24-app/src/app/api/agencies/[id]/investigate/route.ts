import { isRealAgency } from '@/lib/agencies';
import { buildInvestigationPack } from '@/lib/pipeline/investigate';
import { loadAgencyReport } from '@/lib/pipeline/load-report';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }
  const report = loadAgencyReport(id);
  if (!report) {
    return Response.json(
      { error: 'Real data not cached', hint: `npm run fetch-real-data -- ${id}` },
      { status: 503 }
    );
  }
  return Response.json(buildInvestigationPack(id, report));
}
