import fs from 'fs';
import path from 'path';
import { isRealAgency } from '@/lib/agencies';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const file = path.join(process.cwd(), 'data', 'real', `${id}.json`);
  if (!fs.existsSync(file)) {
    return Response.json(
      {
        error: 'Real data not cached',
        hint: `Run: node scripts/fetch-real-data.mjs ${id}`,
      },
      { status: 503 }
    );
  }

  const raw = fs.readFileSync(file, 'utf8');
  return Response.json(JSON.parse(raw));
}
