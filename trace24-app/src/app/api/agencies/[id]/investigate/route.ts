import { isRealAgency } from '@/lib/agencies';
import { buildInvestigationPack } from '@/lib/pipeline/investigate';
import { resolveAgencyReport } from '@/lib/pipeline/resolve-report';

export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }
  try {
    const report = await resolveAgencyReport(id);
    if (!report) {
      return Response.json(
        {
          error: 'ยังสร้างรายงานหน่วยงานไม่ได้',
          hint: 'ตรวจว่ารหัสอยู่ในแคตตาล็อก หรือมี contracts-cache',
        },
        { status: 503 }
      );
    }
    return Response.json(buildInvestigationPack(id, report));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'investigate failed' },
      { status: 500 }
    );
  }
}
