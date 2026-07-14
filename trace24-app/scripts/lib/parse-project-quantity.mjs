/** Mirror of src/lib/parse-project-quantity.ts for Node build scripts. */

const THAI_DIGITS = {
  '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
  '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9',
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
const RE_KM_STATION =
  /กม\.?\s*ที่\s*(\d+)\+(\d+(?:\.\d+)?)\s*(?:ถึง|-|–)\s*กม\.?\s*ที่\s*(\d+)\+(\d+(?:\.\d+)?)/i;
const RE_PIECE = new RegExp(
  String.raw`(?:จำนวน|ปริมาณ)?${SP}(${NUM})${SP}(ระบบ|ชุด|เครื่อง|คัน|หลัง|หน่วย|รายการ|ตัว|แปลง|จุด)(?!\s*เฟส)`,
  'i'
);
const RE_KW = new RegExp(
  String.raw`(${NUM})${SP}(?:กิโลวัตต์|กิโลวัต|กิโล\s*วัตต์|kw)`,
  'i'
);

function toArabicDigitsLocal(s) {
  return String(s || '')
    .replace(/[๐-๙]/g, (d) => THAI_DIGITS[d] ?? d)
    .replace(/(\d)\s+(\d{2})\b/g, '$1.$2');
}

function parseNum(raw) {
  if (!raw) return null;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function inBounds(kind, qty) {
  if (kind === 'baht_per_km') return qty >= 0.05 && qty <= 80;
  if (kind === 'baht_per_m') return qty >= 10 && qty <= 80000;
  if (kind === 'baht_per_m2') return qty >= 20 && qty <= 250000;
  if (kind === 'baht_per_piece') return qty >= 2 && qty <= 5000;
  if (kind === 'baht_per_kw') return qty >= 0.5 && qty <= 5000;
  return false;
}

function rateSane(kind, rate) {
  if (!Number.isFinite(rate) || rate <= 0) return false;
  if (kind === 'baht_per_km') return rate >= 50000 && rate <= 80000000;
  if (kind === 'baht_per_m') return rate >= 200 && rate <= 5000000;
  if (kind === 'baht_per_m2') return rate >= 100 && rate <= 80000;
  if (kind === 'baht_per_piece') return rate >= 500 && rate <= 50000000;
  if (kind === 'baht_per_kw') return rate >= 1000 && rate <= 5000000;
  return false;
}

export function parseProjectQuantity(title) {
  const empty = { rates: {}, pieceCount: null, pieceLabel: null, capacityKw: null };
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

  if (!lengthKm) {
    const st = t.match(RE_KM_STATION);
    if (st) {
      const a = Number(st[1]) + Number(st[2]) / 1000;
      const b = Number(st[3]) + Number(st[4]) / 1000;
      const d = Math.abs(b - a);
      if (d >= 0.05 && d <= 80) lengthKm = d;
    }
  }
  if (!lengthKm && lengthM && lengthM >= 50) lengthKm = lengthM / 1000;
  if (!lengthM && lengthKm) lengthM = lengthKm * 1000;

  let areaM2 = areaM;
  if (!areaM2 && widthM && lengthM && widthM >= 2 && widthM <= 40 && lengthM >= 20) {
    areaM2 = widthM * lengthM;
  }

  const pieceMatch = t.match(RE_PIECE);
  let pieceCount = parseNum(pieceMatch?.[1]);
  let pieceLabel = pieceMatch?.[2] || null;
  if (pieceCount === 1) {
    pieceCount = null;
    pieceLabel = null;
  }
  const kwEach = parseNum(t.match(RE_KW)?.[1]);
  let capacityKw = null;
  if (kwEach) capacityKw = pieceCount ? kwEach * pieceCount : kwEach;

  const rates = {};
  if (lengthKm && inBounds('baht_per_km', lengthKm)) rates.baht_per_km = { qty: lengthKm };
  if (lengthM && inBounds('baht_per_m', lengthM)) rates.baht_per_m = { qty: lengthM };
  if (areaM2 && inBounds('baht_per_m2', areaM2)) rates.baht_per_m2 = { qty: areaM2 };
  if (pieceCount && inBounds('baht_per_piece', pieceCount)) rates.baht_per_piece = { qty: pieceCount };
  if (capacityKw && inBounds('baht_per_kw', capacityKw)) rates.baht_per_kw = { qty: capacityKw };

  return { widthM, lengthM, lengthKm, areaM2, pieceCount, pieceLabel, capacityKw, rates };
}

export function unitRateFromAward(award, kind, qty) {
  if (!award || !qty) return null;
  const rate = award / qty;
  return rateSane(kind, rate) ? rate : null;
}
