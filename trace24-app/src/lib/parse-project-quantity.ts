/**
 * Parse quantities from Thai procurement project titles
 * so we can compare unit rates (บาท/กม., บาท/ม., บาท/ตร.ม., บาท/หน่วย, บาท/กิโลวัตต์)
 * instead of whole-contract awards only.
 */

export type QuantityUnit = 'km' | 'm' | 'm2' | 'piece' | 'kw';

export type UnitRateKind =
  | 'baht_per_km'
  | 'baht_per_m'
  | 'baht_per_m2'
  | 'baht_per_piece'
  | 'baht_per_kw';

export type ParsedProjectQuantity = {
  widthM: number | null;
  lengthM: number | null;
  lengthKm: number | null;
  areaM2: number | null;
  thicknessM: number | null;
  pieceCount: number | null;
  pieceLabel: string | null;
  capacityKw: number | null;
  /** Best qty for the preferred unit of this title */
  primary: { unit: QuantityUnit; qty: number; source: string } | null;
  /** All usable measures for unit-rate calculation */
  rates: Partial<Record<UnitRateKind, { qty: number; source: string }>>;
};

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

const NUM = String.raw`[\d,]+(?:\.\d+)?`;
const SP = String.raw`[\s]*`;

const RE_FALSE =
  /ตรวจเช็คตามระยะทาง|หลักกิโลเมตร|เสื้อแขนยาว|หางยาว|กม\.?\s*5\b|ระยะทางครบ\s*[\d,]+\s*กิโลเมตร/i;

const RE_AREA_M2 = new RegExp(
  String.raw`(?:พื้นที่|พื้นที|พื้นที่ผิวจราจร|พื้นที่ก่อสร้าง|พื้นที่ใช้สอย|พื้นที่ปู)[^\d]{0,28}(?:ไม่น้อยกว่า|ประมาณ)?${SP}(${NUM})${SP}ตารางเมตร`,
  'i'
);

const RE_LENGTH_KM = new RegExp(
  String.raw`(?:ระยะทาง(?:ยาว|ดำเนินการ)?|ยาว)[^\d]{0,24}(?:ไม่น้อยกว่า|ประมาณ)?${SP}(${NUM})${SP}กิโลเมตร`,
  'i'
);

const RE_LENGTH_M = new RegExp(
  String.raw`(?:ยาว|ความยาว(?:รวม)?|ระยะทาง(?:ยาว|ดำเนินการ)?)[^\d]{0,24}(?:ไม่น้อยกว่า|ประมาณ)?${SP}(${NUM})${SP}เมตร`,
  'i'
);

const RE_WIDTH_M = new RegExp(
  String.raw`(?:กว้าง|ผิวจราจรกว้าง|ผิวทางกว้าง|ขนาด(?:ผิวจราจร)?กว้าง)[^\d]{0,18}(?:ไม่น้อยกว่า|ประมาณ)?${SP}(${NUM})(?:${SP}[-–]${SP}(${NUM}))?${SP}เมตร`,
  'i'
);

const RE_THICK = new RegExp(
  String.raw`หนา(?:เฉลี่ย)?[^\d]{0,12}(${NUM})${SP}(เมตร|เซนติเมตร|ซม\.?)`,
  'i'
);

const RE_KM_STATION =
  /กม\.?\s*ที่\s*(\d+)\+(\d+(?:\.\d+)?)\s*(?:ถึง|-|–)\s*กม\.?\s*ที่\s*(\d+)\+(\d+(?:\.\d+)?)/i;

/** จำนวน 4 ระบบ / 2 ชุด / 10 เครื่อง — skip เฟส */
const RE_PIECE = new RegExp(
  String.raw`(?:จำนวน|ปริมาณ)?${SP}(${NUM})${SP}(ระบบ|ชุด|เครื่อง|คัน|หลัง|หน่วย|รายการ|ตัว|แปลง|จุด)(?!\s*เฟส)`,
  'i'
);

/** ขนาด 10 กิโลวัตต์ / 10 kW — no \\b (Thai is non-word in JS) */
const RE_KW = new RegExp(
  String.raw`(${NUM})${SP}(?:กิโลวัตต์|กิโลวัต|กิโล\s*วัตต์|kw)`,
  'i'
);

export const UNIT_RATE_LABELS: Record<UnitRateKind, string> = {
  baht_per_km: 'บาท/กม.',
  baht_per_m: 'บาท/ม.',
  baht_per_m2: 'บาท/ตร.ม.',
  baht_per_piece: 'บาท/หน่วย',
  baht_per_kw: 'บาท/กิโลวัตต์',
};

/** Preferred unit-rate kind by work category id. */
export function preferredUnitRateKind(categoryId: string): UnitRateKind | null {
  switch (categoryId) {
    case 'road_concrete':
    case 'road_asphalt':
      return 'baht_per_km';
    case 'drainage':
    case 'water_supply':
      return 'baht_per_m';
    case 'building':
      return 'baht_per_m2';
    case 'electrical':
      return 'baht_per_kw';
    case 'equipment':
    case 'vehicle':
    case 'medical':
    case 'it_comms':
      return 'baht_per_piece';
    default:
      return null;
  }
}

export function toArabicDigitsLocal(s: string) {
  return String(s || '')
    .replace(/[๐-๙]/g, (d) => THAI_DIGITS[d] ?? d)
    // fix broken "6 00" → "6.00"
    .replace(/(\d)\s+(\d{2})\b/g, '$1.$2');
}

function parseNum(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function stationKm(km: string, m: string): number {
  return Number(km) + Number(m) / 1000;
}

function inBounds(kind: UnitRateKind, qty: number): boolean {
  if (kind === 'baht_per_km') return qty >= 0.05 && qty <= 80;
  if (kind === 'baht_per_m') return qty >= 10 && qty <= 80000;
  if (kind === 'baht_per_m2') return qty >= 20 && qty <= 250000;
  if (kind === 'baht_per_piece') return qty >= 2 && qty <= 5000;
  if (kind === 'baht_per_kw') return qty >= 0.5 && qty <= 5000;
  return false;
}

function rateSane(kind: UnitRateKind, rate: number): boolean {
  if (!Number.isFinite(rate) || rate <= 0) return false;
  if (kind === 'baht_per_km') return rate >= 50_000 && rate <= 80_000_000;
  if (kind === 'baht_per_m') return rate >= 200 && rate <= 5_000_000;
  if (kind === 'baht_per_m2') return rate >= 100 && rate <= 80_000;
  if (kind === 'baht_per_piece') return rate >= 500 && rate <= 50_000_000;
  if (kind === 'baht_per_kw') return rate >= 1_000 && rate <= 5_000_000;
  return false;
}

function pieceLabelTh(label: string): string {
  return label || 'หน่วย';
}

export function parseProjectQuantity(title: string): ParsedProjectQuantity {
  const empty: ParsedProjectQuantity = {
    widthM: null,
    lengthM: null,
    lengthKm: null,
    areaM2: null,
    thicknessM: null,
    pieceCount: null,
    pieceLabel: null,
    capacityKw: null,
    primary: null,
    rates: {},
  };
  const raw = String(title || '');
  if (!raw.trim() || RE_FALSE.test(raw)) return empty;

  const t = toArabicDigitsLocal(raw);

  const areaM = parseNum(t.match(RE_AREA_M2)?.[1]);
  let lengthKm = parseNum(t.match(RE_LENGTH_KM)?.[1]);
  let lengthM = parseNum(t.match(RE_LENGTH_M)?.[1]);
  const widthMatch = t.match(RE_WIDTH_M);
  let widthM = parseNum(widthMatch?.[1]);
  if (widthMatch?.[2]) {
    const w2 = parseNum(widthMatch[2]);
    if (widthM && w2) widthM = (widthM + w2) / 2;
  }
  const thickMatch = t.match(RE_THICK);
  let thicknessM = parseNum(thickMatch?.[1]);
  if (thicknessM && thickMatch?.[2] && /ซม|เซนติ/i.test(thickMatch[2])) {
    thicknessM = thicknessM / 100;
  }

  if (!lengthKm) {
    const st = t.match(RE_KM_STATION);
    if (st) {
      const a = stationKm(st[1], st[2]);
      const b = stationKm(st[3], st[4]);
      const d = Math.abs(b - a);
      if (d >= 0.05 && d <= 80) lengthKm = d;
    }
  }

  // derive km from meters for road-length comparison
  if (!lengthKm && lengthM && lengthM >= 50) {
    lengthKm = lengthM / 1000;
  }
  if (!lengthM && lengthKm) {
    lengthM = lengthKm * 1000;
  }

  // estimate area from W×L when title omitted พื้นที่
  let areaM2 = areaM;
  if (!areaM2 && widthM && lengthM && widthM >= 2 && widthM <= 40 && lengthM >= 20) {
    areaM2 = widthM * lengthM;
  }

  const pieceMatch = t.match(RE_PIECE);
  let pieceCount = parseNum(pieceMatch?.[1]);
  let pieceLabel = pieceMatch?.[2] ? pieceLabelTh(pieceMatch[2]) : null;
  // ignore "3 เฟส" false friends already via (?!เฟส); also ignore lone "1 ระบบ"
  if (pieceCount === 1) {
    pieceCount = null;
    pieceLabel = null;
  }

  const kwEach = parseNum(t.match(RE_KW)?.[1]);
  let capacityKw: number | null = null;
  if (kwEach) {
    capacityKw = pieceCount ? kwEach * pieceCount : kwEach;
  }

  const rates: ParsedProjectQuantity['rates'] = {};
  if (lengthKm && inBounds('baht_per_km', lengthKm)) {
    rates.baht_per_km = {
      qty: lengthKm,
      source: lengthM && lengthKm === lengthM / 1000 ? 'ยาว(ม.)→กม.' : 'ระยะทางกม.',
    };
  }
  if (lengthM && inBounds('baht_per_m', lengthM)) {
    rates.baht_per_m = { qty: lengthM, source: 'ยาว(ม.)' };
  }
  if (areaM2 && inBounds('baht_per_m2', areaM2)) {
    rates.baht_per_m2 = {
      qty: areaM2,
      source: areaM ? 'พื้นที่ตร.ม.' : 'กว้าง×ยาว',
    };
  }
  if (pieceCount && inBounds('baht_per_piece', pieceCount)) {
    rates.baht_per_piece = {
      qty: pieceCount,
      source: `จำนวน${pieceLabel || 'หน่วย'}`,
    };
  }
  if (capacityKw && inBounds('baht_per_kw', capacityKw)) {
    rates.baht_per_kw = {
      qty: capacityKw,
      source: pieceCount && kwEach ? `${kwEach} กิโลวัตต์ × ${pieceCount}` : 'กำลังไฟฟ้า(กิโลวัตต์)',
    };
  }

  let primary: ParsedProjectQuantity['primary'] = null;
  if (rates.baht_per_kw) {
    primary = { unit: 'kw', qty: rates.baht_per_kw.qty, source: rates.baht_per_kw.source };
  } else if (rates.baht_per_piece) {
    primary = { unit: 'piece', qty: rates.baht_per_piece.qty, source: rates.baht_per_piece.source };
  } else if (rates.baht_per_km) {
    primary = { unit: 'km', qty: rates.baht_per_km.qty, source: rates.baht_per_km.source };
  } else if (rates.baht_per_m2) {
    primary = { unit: 'm2', qty: rates.baht_per_m2.qty, source: rates.baht_per_m2.source };
  } else if (rates.baht_per_m) {
    primary = { unit: 'm', qty: rates.baht_per_m.qty, source: rates.baht_per_m.source };
  }

  return {
    widthM,
    lengthM,
    lengthKm,
    areaM2,
    thicknessM,
    pieceCount,
    pieceLabel,
    capacityKw,
    primary,
    rates,
  };
}

export function unitRateFromAward(
  award: number,
  kind: UnitRateKind,
  qty: number
): number | null {
  if (!award || !qty) return null;
  const rate = award / qty;
  return rateSane(kind, rate) ? rate : null;
}

export function formatUnitRate(n: number, kind: UnitRateKind, pieceLabel?: string | null): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (kind === 'baht_per_piece' && pieceLabel) {
    return `${Math.round(n).toLocaleString('th-TH')} บาท/${pieceLabel}`;
  }
  return `${Math.round(n).toLocaleString('th-TH')} ${UNIT_RATE_LABELS[kind]}`;
}

export function formatQuantity(qty: number, unit: QuantityUnit, pieceLabel?: string | null): string {
  if (!Number.isFinite(qty) || qty <= 0) return '—';
  if (unit === 'km') {
    return `${qty.toLocaleString('th-TH', { maximumFractionDigits: 3 })} กม.`;
  }
  if (unit === 'm2') {
    return `${Math.round(qty).toLocaleString('th-TH')} ตร.ม.`;
  }
  if (unit === 'piece') {
    return `${Math.round(qty).toLocaleString('th-TH')} ${pieceLabel || 'หน่วย'}`;
  }
  if (unit === 'kw') {
    return `${qty.toLocaleString('th-TH', { maximumFractionDigits: 1 })} กิโลวัตต์`;
  }
  return `${Math.round(qty).toLocaleString('th-TH')} ม.`;
}

/** Human label for a unit kind, optionally with piece noun (ระบบ/ชุด). */
export function unitKindLabel(kind: UnitRateKind, pieceLabel?: string | null): string {
  if (kind === 'baht_per_piece' && pieceLabel) return `บาท/${pieceLabel}`;
  return UNIT_RATE_LABELS[kind];
}
