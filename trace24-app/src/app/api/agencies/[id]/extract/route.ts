import { isRealAgency } from '@/lib/agencies';
import { extractFromUrl } from '@/lib/pipeline/extract';
import { storeEvidence } from '@/lib/pipeline/evidence';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as { url?: string; store?: boolean };
  const url = (body.url || '').trim();
  if (!url) return Response.json({ error: 'url required' }, { status: 400 });

  try {
    const extracted = await extractFromUrl(url);
    let evidence = null;
    if (body.store !== false) {
      evidence = storeEvidence({
        agencyId: id,
        sourceUrl: url,
        contentType: extracted.contentType,
        body: extracted.text || JSON.stringify(extracted.metadata),
        labels: ['extract', extracted.method],
        filenameHint: extracted.method,
      });
    }
    return Response.json({
      extracted: {
        ...extracted,
        text: extracted.text.slice(0, 4000),
      },
      evidence,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'extract failed' },
      { status: 502 }
    );
  }
}
