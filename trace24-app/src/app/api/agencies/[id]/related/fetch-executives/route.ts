import { getCatalogAgency } from '@/lib/agency-catalog';
import { websiteForAgency } from '@/lib/agency-websites';
import { isRealAgency, REAL_AGENCIES } from '@/lib/agencies';
import { fetchAgencyExecutives } from '@/lib/pipeline/fetch-executives';
import { getOrEmptyRelatedPack } from '@/lib/pipeline/related-party-store';

export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isRealAgency(id)) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    web?: string;
    merge?: boolean;
  };

  const agency =
    getCatalogAgency(id) || REAL_AGENCIES.find((a) => a.id === id) || null;
  const knownWeb = body.web || agency?.web || websiteForAgency(id) || '';
  const agencyName = agency?.th || id;

  const result = await fetchAgencyExecutives({
    agencyId: id,
    agencyName,
    url: body.url || null,
    web: knownWeb || null,
  });

  const pack = getOrEmptyRelatedPack(id);
  const mergedExecutives =
    body.merge === false
      ? result.executives
      : [
          ...pack.executives,
          ...result.executives.filter(
            (e) =>
              !pack.executives.some(
                (x) => x.name === e.name && x.title === e.title
              )
          ),
        ];

  const draftPack = {
    ...pack,
    agencyId: id,
    updatedAt: new Date().toISOString(),
    executives: mergedExecutives,
    note: result.note,
  };

  return Response.json({
    ok: result.ok,
    draftPack,
    executives: result.executives,
    sources: result.sources,
    model: result.model,
    note: result.note,
    error: result.error,
    ethics:
      'รายชื่อจากเว็บเป็น draft — ตรวจแก้ก่อนกดบันทึก · ไม่ใช่ข้อพิสูจน์ความเกี่ยวข้อง',
  });
}
