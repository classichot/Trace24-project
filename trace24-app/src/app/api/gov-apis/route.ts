import { catalogForTrace24 } from '@/lib/gov-apis/catalog';

export async function GET() {
  return Response.json(catalogForTrace24());
}
