/** Mirror of src/lib/title-similarity.ts for build scripts. */

export const SERVICE_SIMILARITY_THRESHOLD = 0.8;

const THAI_DIGITS = {
  '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
  '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9',
};

function toArabicDigits(s) {
  return String(s || '').replace(/[๐-๙]/g, (d) => THAI_DIGITS[d] ?? d);
}

export function titleStem(name) {
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

export function tokenSimilarity(a, b) {
  const ta = new Set(String(a || '').split(/\s+/).filter((w) => w.length > 1));
  const tb = new Set(String(b || '').split(/\s+/).filter((w) => w.length > 1));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

export function stemSimilarity(stemA, stemB) {
  if (!stemA || !stemB) return 0;
  if (stemA === stemB) return 1;
  return tokenSimilarity(stemA, stemB);
}
