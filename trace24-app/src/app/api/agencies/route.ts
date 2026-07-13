import { REAL_AGENCIES } from '@/lib/agencies';

export async function GET() {
  return Response.json(REAL_AGENCIES);
}
