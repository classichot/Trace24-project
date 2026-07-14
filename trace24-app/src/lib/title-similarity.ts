/**
 * Title / service similarity for peer grouping.
 * Benchmark peers must be > 80% similar — otherwise P25–P75 blows out.
 */
import { toArabicDigits } from '@/lib/pipeline/normalize';

/** Strict threshold: only group when similarity is greater than this. */
export const SERVICE_SIMILARITY_THRESHOLD = 0.8;

/** Collapse location-specific parts so same service type can match across roads/villages. */
export function titleStem(name: string): string {
  let t = toArabicDigits(String(name || ''))
    .toLowerCase()
    .replace(/ประกวดราคา|ด้วยวิธี|อิเล็กทรอนิกส์|e-bidding|คัดเลือก|เฉพาะเจาะจง|สอบราคา/gi, ' ')
    .replace(/จ้างโครงการ|จ้างเหมา|โครงการ/gi, ' ')
    .replace(/ปีงบประมาณ\s*\d+/gi, ' ')
    .replace(/หมู่ที่?\s*\d+/gi, ' ')
    .replace(/ซอย\s*[^\s]+/gi, ' ')
    .replace(/บ้าน[^\s]+/gi, 'บ้าน')
    .replace(/ตำบล[^\s]+|อำเภอ[^\s]+|จังหวัด[^\s]+/gi, ' ')
    .replace(/สาย[^\s]*/gi, 'สาย')
    .replace(/ช่วงที่?\s*\d+/gi, 'ช่วง')
    .replace(/\d+(\.\d+)?/g, '#')
    .replace(/[^\u0E00-\u0E7Fa-z#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const work =
    t.match(
      /ปรับปรุงผิวทาง[^\s]*|ลาดยาง[^\s]*|แอสฟัลต์[^\s]*|คสล[^\s]*|คอนกรีต[^\s]*|ถนน[^\s]*|ระบายน้ำ[^\s]*|ท่อ[^\s]*|โซลาร์[^\s]*|solar[^\s]*|ไฟฟ้า[^\s]*/i
    )?.[0] || '';
  if (work) {
    const rest = t.replace(work, ' ').trim().slice(0, 48);
    return `${work} ${rest}`.trim();
  }
  return t.slice(0, 80);
}

export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(
    String(a || '')
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );
  const tb = new Set(
    String(b || '')
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/** True only when service/title similarity is strictly greater than 80%. */
export function servicesSimilar(nameA: string, nameB: string, threshold = SERVICE_SIMILARITY_THRESHOLD): boolean {
  const sa = titleStem(nameA);
  const sb = titleStem(nameB);
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  return tokenSimilarity(sa, sb) > threshold;
}

export function stemSimilarity(stemA: string, stemB: string): number {
  if (!stemA || !stemB) return 0;
  if (stemA === stemB) return 1;
  return tokenSimilarity(stemA, stemB);
}
