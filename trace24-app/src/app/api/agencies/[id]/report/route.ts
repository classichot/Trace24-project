import fs from 'fs';
import path from 'path';
import { getCatalogAgency } from '@/lib/agency-catalog';
import { isRealAgency, REAL_AGENCIES } from '@/lib/agencies';
import { buildCatalogStubReport } from '@/lib/pipeline/catalog-stub';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const file = path.join(process.cwd(), 'data', 'real', `${id}.json`);
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8');
    return Response.json(JSON.parse(raw));
  }

  const agency =
    getCatalogAgency(id) || REAL_AGENCIES.find((a) => a.id === id);
  if (!agency) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  return Response.json(buildCatalogStubReport(agency), {
    headers: { 'X-TRACE24-Catalog-Only': '1' },
  });
}
