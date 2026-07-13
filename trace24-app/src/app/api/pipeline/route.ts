import { getPipelineStatus } from '@/lib/pipeline/orchestrator';
import { listCachedAgencyIds } from '@/lib/pipeline/load-report';

export async function GET() {
  return Response.json(getPipelineStatus(listCachedAgencyIds()));
}
