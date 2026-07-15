import { adminUnauthorizedResponse, assertAdminWrite } from '@/lib/admin-auth';
import { isRealAgency } from '@/lib/agencies';
import {
  collectProjectAnnounceUrls,
  extractFromAnnounceUrl,
} from '@/lib/pipeline/announce-fallback';
import { resolveAgencyReport } from '@/lib/pipeline/resolve-report';
import { fetchCgdContracts } from '@/lib/gov-apis/opend';

/**
 * Prefer Open D when healthy; on crash/timeout/empty → extract from announcement HTML.
 * POST body: { projectId?: string, preferOpenD?: boolean }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = assertAdminWrite(req);
  if (!gate.ok) return adminUnauthorizedResponse(gate);

  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }
  const report = await resolveAgencyReport(id);
  if (!report) {
    return Response.json(
      {
        error: 'ยังสร้างรายงานหน่วยงานไม่ได้',
        hint: 'สแกนหน่วยงานก่อน หรือตรวจ contracts-cache',
      },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    preferOpenD?: boolean;
    keyword?: string;
  };

  const openDKey = process.env.OPEND_API_KEY?.trim();
  let openD: { ok: boolean; status?: number; error?: string; count?: number } | null = null;

  if (body.preferOpenD !== false && openDKey) {
    const year = new Date().getFullYear() + 543 - 1; // rough BE fiscal guess
    const result = await fetchCgdContracts({
      apiKey: openDKey,
      year,
      keyword: body.keyword || report.agency?.th || '',
      limit: 5,
      timeoutMs: 8000,
    });
    if (result.ok) {
      const data = result.data as { result?: unknown[] };
      const count = Array.isArray(data?.result) ? data.result.length : 0;
      openD = { ok: true, status: result.status, count };
      if (count > 0) {
        return Response.json({
          strategy: 'opend',
          openD,
          note: 'Open D responded — use cached/API enrich; announcement fallback not required',
        });
      }
      openD = { ok: false, status: result.status, error: 'empty result', count: 0 };
    } else {
      openD = { ok: false, status: result.status, error: result.error };
    }
  } else if (!openDKey) {
    openD = { ok: false, error: 'OPEND_API_KEY missing' };
  }

  // Fallback: extract from announcement pages
  const projectIds = body.projectId
    ? [body.projectId]
    : (report.priorityOrder || Object.keys(report.projects || {})).slice(0, 12);

  const extractions = [];
  for (const pid of projectIds) {
    const pr = report.projects?.[pid];
    if (!pr) continue;
    const urls = collectProjectAnnounceUrls(pr);
    if (!urls.length) {
      extractions.push({ projectId: pid, ok: false, error: 'no announce URL' });
      continue;
    }
    let done = false;
    for (const url of urls) {
      try {
        const parsed = await extractFromAnnounceUrl(url);
        if (parsed.winner || parsed.price != null) {
          extractions.push({
            projectId: pid,
            code: pr.code,
            name: pr.name,
            ok: true,
            ...parsed,
          });
          done = true;
          break;
        }
      } catch (e) {
        // try next
        if (url === urls[urls.length - 1]) {
          extractions.push({
            projectId: pid,
            ok: false,
            error: e instanceof Error ? e.message : 'extract failed',
          });
        }
      }
    }
    if (!done && !extractions.some((x) => x.projectId === pid)) {
      extractions.push({ projectId: pid, ok: false, error: 'parse miss' });
    }
  }

  return Response.json({
    strategy: 'announce-fallback',
    reason: openD?.ok === false ? openD.error || 'Open D unavailable' : 'forced fallback',
    openD,
    count: extractions.filter((x) => x.ok).length,
    extractions,
    note: 'Official backup path: scrape e-GP ShowHTMLFile / agency announce pages directly',
  });
}
