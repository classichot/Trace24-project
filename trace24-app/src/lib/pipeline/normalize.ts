const THAI_DIGITS: Record<string, string> = {
  '๐': '0',
  '๑': '1',
  '๒': '2',
  '๓': '3',
  '๔': '4',
  '๕': '5',
  '๖': '6',
  '๗': '7',
  '๘': '8',
  '๙': '9',
};

/** Validation + normalisation helpers */
export function toArabicDigits(s: string) {
  return String(s).replace(/[๐-๙]/g, (d) => THAI_DIGITS[d] ?? d);
}

export function parseBaht(text: string | null | undefined): number | null {
  if (!text || text === '—') return null;
  const t = toArabicDigits(text).replace(/[฿\s]/g, '');
  const m = t.match(/([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function normalizeCompanyName(name: string) {
  return name
    .replace(/\s+/g, ' ')
    .replace(/ห้างหุ้นส่วนจำกัด/g, 'หจก.')
    .replace(/บริษัท\s+/g, 'บจก. ')
    .replace(/\s*จำกัด\s*\(มหาชน\)/g, ' จำกัด (มหาชน)')
    .trim();
}

export function normalizeProjectTitle(title: string) {
  return title
    .replace(/ประกาศ(ผู้ชนะ|รายชื่อผู้ชนะ|เชิญชวน)[^—]*/gi, '')
    .replace(/โดยวิธี[^—]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferProjectCategory(name: string) {
  if (/ถนน|คสล|ผิวจราจร|รางวี/i.test(name)) return 'งานก่อสร้างถนน';
  if (/ระบายน้ำ|ท่อ/i.test(name)) return 'งานระบายน้ำ';
  if (/อาคาร|ซ่อมแซม|ปรับปรุง/i.test(name)) return 'งานปรับปรุงอาคาร';
  if (/ครุภัณฑ์|รถ|เครื่อง/i.test(name)) return 'จัดซื้อครุภัณฑ์';
  if (/อาหาร|นม|จัดเลี้ยง/i.test(name)) return 'บริการอาหาร';
  return 'จัดซื้อจัดจ้าง';
}

export function methodBucket(method: string) {
  if (/e-bidding|อิเล็กทรอนิกส์/i.test(method)) return 'e-bidding';
  if (/เฉพาะเจาะจง/i.test(method)) return 'เฉพาะเจาะจง';
  if (/คัดเลือก/i.test(method)) return 'คัดเลือก';
  return method || 'อื่น ๆ';
}

/** Resolve internal contractor id (c1) → display name. */
export function contractorDisplayName(
  winnerKey: string | null | undefined,
  contractors?: Record<string, { name?: string }> | null
): string {
  const key = String(winnerKey || '').trim();
  if (!key || key === '—') return '—';
  const named = contractors?.[key]?.name?.trim();
  if (named) return named;
  // Already a company name (not an internal id like c12)
  if (!/^c\d+$/i.test(key)) return key;
  return key;
}

/** Project label for UI: name preferred, code as secondary. */
export function projectDisplayLabel(
  pr: { code?: string | null; name?: string | null } | null | undefined,
  opts?: { maxName?: number }
): string {
  const code = String(pr?.code || '').trim();
  let name = String(pr?.name || '').trim();
  const max = opts?.maxName ?? 48;
  if (name.length > max) name = `${name.slice(0, max - 1)}…`;
  if (name && code) return `${name} (${code})`;
  return name || code || '—';
}

/** Rewrite alert titles that still use generic "ผู้รับจ้างรายเดียว" or bare e-GP codes. */
export function enrichAlertTitle(
  title: string | null | undefined,
  pr: { code?: string | null; name?: string | null; winner?: string | null } | null | undefined,
  contractors?: Record<string, { name?: string }> | null
): string {
  let t = String(title || '').trim();
  if (!t) return t;
  const winnerName = contractorDisplayName(pr?.winner, contractors);
  if (
    winnerName !== '—' &&
    /ผู้รับจ้างรายเดียว|ผู้ชนะรายเดียว/.test(t) &&
    !t.includes(winnerName)
  ) {
    t = t.replace(/ผู้รับจ้างรายเดียว|ผู้ชนะรายเดียว/, winnerName);
  }
  const code = String(pr?.code || '').trim();
  const projectLabel = projectDisplayLabel(pr, { maxName: 40 });
  if (code && /^\d{8,}$/.test(code) && t.includes(code) && projectLabel !== code && projectLabel !== '—') {
    t = t.replace(code, projectLabel);
  }
  return t;
}
