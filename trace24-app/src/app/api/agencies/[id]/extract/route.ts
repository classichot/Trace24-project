import { isRealAgency } from '@/lib/agencies';
import { adminUnauthorizedResponse, assertAdminWrite } from '@/lib/admin-auth';
import { attachClaim, storeEvidence } from '@/lib/pipeline/evidence';
import { extractFromUrl } from '@/lib/pipeline/extract';

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

  // Persisting evidence is an Admin write; preview-only extract (store:false) stays public.
  if (body.store !== false) {
    const gate = assertAdminWrite(req);
    if (!gate.ok) return adminUnauthorizedResponse(gate);
  }

  try {
    const fetched = await fetch(url, {
      headers: { 'User-Agent': 'TRACE24/1.0 (public evidence capture)' },
      redirect: 'follow',
    });
    const rawBuf = Buffer.from(await fetched.arrayBuffer());
    const contentType = fetched.headers.get('content-type') || 'application/octet-stream';

    const extracted = await extractFromUrl(url);
    let evidence: ReturnType<typeof storeEvidence> | null = null;
    let claims: ReturnType<typeof attachClaim>[] = [];

    if (body.store !== false) {
      // Prefer original bytes for immutability; fall back to extracted text only if empty
      const originalBody = rawBuf.length > 0 ? rawBuf : extracted.text || JSON.stringify(extracted.metadata);
      evidence = storeEvidence({
        agencyId: id,
        sourceUrl: url,
        contentType: contentType || extracted.contentType,
        body: originalBody,
        labels: ['extract', extracted.method, 'immutable'],
        filenameHint: extracted.method,
        extractionMethod: extracted.method,
        extractedText: extracted.text,
        confidence: extracted.confidence,
      });

      const claimTexts = [
        extracted.title ? `เอกสารมีชื่อเรื่อง: ${extracted.title}` : null,
        extracted.text ? `สกัดข้อความได้ ${extracted.text.length} ตัวอักษ ด้วยวิธี ${extracted.method}` : null,
        extracted.tables.length ? `พบตาราง ${extracted.tables.length} แถวในเอกสาร` : null,
      ].filter(Boolean) as string[];

      claims = claimTexts.map((claim, i) =>
        attachClaim({
          evidence: evidence!,
          claim,
          locator: {
            page: null,
            table: extracted.tables.length ? i : null,
            section: extracted.title || extracted.method,
            charStart: 0,
            charEnd: Math.min(extracted.text.length, 500),
          },
          extractedText: extracted.text.slice(0, 1500),
          extractionMethod: extracted.method,
          confidence: extracted.confidence,
          entityIds: [`agency:${id}`],
        })
      );
    }

    return Response.json({
      extracted: {
        ...extracted,
        text: extracted.text.slice(0, 4000),
      },
      evidence,
      claims,
      provenance: evidence
        ? {
            claim: 'เอกสารสาธารณะถูกเก็บแบบ immutable พร้อม checksum',
            sourceUrl: evidence.sourceUrl,
            documentPath: evidence.storedPath,
            downloadedAt: evidence.fetchedAt,
            checksumSha256: evidence.checksumSha256,
            extractionMethod: evidence.extractionMethod,
            confidence: evidence.confidence,
          }
        : null,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'extract failed' },
      { status: 502 }
    );
  }
}
