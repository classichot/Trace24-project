import { loadNationalPriceBenchmarks } from '@/lib/pipeline/price-benchmark';
import { categorizeWork, WORK_CATEGORY_DEFS } from '@/lib/work-categories';

export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get('category') || '';
  const province = url.searchParams.get('province')?.trim() || '';
  const q = url.searchParams.get('q')?.trim() || '';

  const data = loadNationalPriceBenchmarks();
  if (!data) {
    return Response.json(
      {
        error: 'benchmarks_missing',
        hint: 'รัน npm run build-price-benchmarks แล้ว commit data/benchmarks',
      },
      { status: 503 }
    );
  }

  const inferred = q ? categorizeWork(q) : null;
  const categoryId = category || inferred?.id || '';

  const categories = Object.entries(data.categories)
    .map(([id, bucket]) => ({
      id,
      label: bucket.label,
      n: bucket.n,
      median: bucket.median,
      p25: bucket.p25,
      p75: bucket.p75,
      provinceCount: Object.keys(bucket.byProvince || {}).length,
      perKm: bucket.byUnit?.baht_per_km
        ? {
            n: bucket.byUnit.baht_per_km.n,
            median: bucket.byUnit.baht_per_km.median,
            p25: bucket.byUnit.baht_per_km.p25,
            p75: bucket.byUnit.baht_per_km.p75,
          }
        : null,
      perM2: bucket.byUnit?.baht_per_m2
        ? {
            n: bucket.byUnit.baht_per_m2.n,
            median: bucket.byUnit.baht_per_m2.median,
            p25: bucket.byUnit.baht_per_m2.p25,
            p75: bucket.byUnit.baht_per_m2.p75,
          }
        : null,
      perM: bucket.byUnit?.baht_per_m
        ? {
            n: bucket.byUnit.baht_per_m.n,
            median: bucket.byUnit.baht_per_m.median,
            p25: bucket.byUnit.baht_per_m.p25,
            p75: bucket.byUnit.baht_per_m.p75,
          }
        : null,
      perPiece: bucket.byUnit?.baht_per_piece
        ? {
            n: bucket.byUnit.baht_per_piece.n,
            median: bucket.byUnit.baht_per_piece.median,
            p25: bucket.byUnit.baht_per_piece.p25,
            p75: bucket.byUnit.baht_per_piece.p75,
          }
        : null,
      perKw: bucket.byUnit?.baht_per_kw
        ? {
            n: bucket.byUnit.baht_per_kw.n,
            median: bucket.byUnit.baht_per_kw.median,
            p25: bucket.byUnit.baht_per_kw.p25,
            p75: bucket.byUnit.baht_per_kw.p75,
          }
        : null,
    }))
    .sort((a, b) => b.n - a.n);

  const selected = categoryId ? data.categories[categoryId] : null;
  let provinceStats = null as null | {
    province: string;
    n: number;
    median: number;
    p25: number;
    p75: number;
  };
  if (selected && province && selected.byProvince?.[province]) {
    const p = selected.byProvince[province];
    provinceStats = {
      province,
      n: p.n,
      median: p.median,
      p25: p.p25,
      p75: p.p75,
    };
  }

  const unitStats = selected?.byUnit
    ? Object.fromEntries(
        Object.entries(selected.byUnit).map(([kind, u]) => {
          const provU = province && u.byProvince?.[province] ? u.byProvince[province] : null;
          const src = provU && provU.n >= 5 ? provU : u;
          return [
            kind,
            {
              unitLabel: u.unitLabel || kind,
              n: src.n,
              median: src.median,
              p25: src.p25,
              p75: src.p75,
              scope: provU && provU.n >= 5 ? `จังหวัด${province}` : 'ทั้งประเทศ',
            },
          ];
        })
      )
    : {};

  const provinces = selected
    ? Object.keys(selected.byProvince || {})
        .sort((a, b) => a.localeCompare(b, 'th'))
    : [];

  return Response.json({
    generatedAt: data.generatedAt,
    source: data.source,
    note:
      data.note ||
      'ค่ากลางสำหรับเทียบโครงการใช้เฉพาะกลุ่มงานคล้าย >90% — ค่าในตารางหมวดเป็นภาพรวมหยาบ',
    similarityThreshold: data.similarityThreshold ?? 0.8,
    catalog: WORK_CATEGORY_DEFS.map((d) => ({ id: d.id, label: d.label, hint: d.hint })),
    categories,
    inferred,
    selected: selected
      ? {
          id: categoryId,
          label: selected.label,
          n: selected.n,
          median: selected.median,
          p25: selected.p25,
          p75: selected.p75,
          provinceStats,
          provinces,
          byUnit: unitStats,
        }
      : null,
  });
}
