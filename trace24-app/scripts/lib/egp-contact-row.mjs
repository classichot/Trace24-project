/**
 * egp-contact (ภาษีไปไหน / data.go.th) often ships with shifted columns:
 *   พิกัดของโครงการ  → เลขนิติบุคคล (13 digits)
 *   ละติจูดโครงการ   → ชื่อผู้ชนะ
 *   ลองจิจูดโครงการ  → เลขที่สัญญา
 * while ชื่อผู้ชนะ / เลขนิติบุคคล hold dates.
 */
const THAI_DATE_RE =
  /^\d{1,2}\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/;

export function looksLikeThaiDate(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  if (THAI_DATE_RE.test(t)) return true;
  if (/^\d{1,2}[\/\-]\d{1,2}/.test(t)) return true;
  return false;
}

export function looksLikeTin(s) {
  return /^\d{13}$/.test(String(s || '').replace(/\D/g, '')) && String(s || '').replace(/\D/g, '').length === 13;
}

export function looksLikeWinnerName(s) {
  const t = String(s || '').trim();
  if (!t || t.length < 2) return false;
  if (looksLikeThaiDate(t)) return false;
  if (/^\d+(\.\d+)?$/.test(t)) return false;
  if (/^POINT|^LINESTRING|^POLYGON/i.test(t)) return false;
  return true;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {Record<string, string>}
 */
export function normalizeEgpContactRow(row) {
  const r = row || {};
  const get = (k) => {
    const v = r[k];
    return v == null ? '' : String(v).trim();
  };

  let winner = get('ชื่อผู้ชนะ');
  let tin = get('เลขนิติบุคคล').replace(/\D/g, '');
  const geoTin = get('พิกัดของโครงการ').replace(/\D/g, '');
  const geoWinner = get('ละติจูดโครงการ');
  const geoContractNo = get('ลองจิจูดโครงการ');

  const winnerBroken = !looksLikeWinnerName(winner);
  const tinBroken = !looksLikeTin(tin);

  if (winnerBroken && looksLikeWinnerName(geoWinner)) winner = geoWinner;
  if (tinBroken && looksLikeTin(geoTin)) tin = geoTin.slice(0, 13);

  // Secondary: sometimes tin sits in สถานะโครงการ as number-like string already consumed
  if (!looksLikeTin(tin) && looksLikeTin(get('พิกัดของโครงการ'))) {
    tin = get('พิกัดของโครงการ').replace(/\D/g, '').slice(0, 13);
  }

  let price = get('ราคาตกลงซื้อ/จ้าง') || get('งบสัญญา(บาท)');
  const contractNoField = get('เลขที่สัญญา');
  // When shifted, เลขที่สัญญา often holds the agreed price
  if ((!price || !/^\d/.test(price)) && /^\d+(\.\d+)?$/.test(contractNoField)) {
    price = contractNoField;
  }

  let contractNo = geoContractNo;
  if (!contractNo || looksLikeThaiDate(contractNo) || /^\d+(\.\d+)?$/.test(contractNo) && Number(contractNo) > 100000) {
    // keep geo contract no when it looks like "46/2568"
    if (/[\/\-]/.test(geoContractNo) || /[ก-๙]/.test(geoContractNo)) contractNo = geoContractNo;
    else if (!/^\d{6,}$/.test(contractNoField)) contractNo = contractNoField;
  }

  let signDate = get('วันที่ลงนามสัญญา');
  if (signDate === 'ระหว่างดำเนินการ' || !signDate) {
    const alt = get('เลขนิติบุคคล');
    if (looksLikeThaiDate(alt)) signDate = alt;
  }

  let endDate = get('วันที่สิ้นสุดสัญญา');
  if (!endDate || endDate === 'null') {
    const alt = get('ชื่อผู้ชนะ');
    if (looksLikeThaiDate(alt)) endDate = alt;
  }

  return {
    รหัสโครงการ: get('รหัสโครงการ'),
    ชื่อโครงการ: get('ชื่อโครงการ'),
    'งบประมาณ(บาท)': get('งบประมาณ(บาท)'),
    'กลุ่มวิธีจัดซื้อฯ': get('กลุ่มวิธีจัดซื้อฯ'),
    วิธีจัดซื้อฯ: get('วิธีจัดซื้อฯ'),
    ชื่อหน่วยงาน: get('ชื่อหน่วยงาน'),
    จังหวัด: get('จังหวัด'),
    'เขต/อำเภอ': get('เขต/อำเภอ'),
    ปีงบประมาณ: get('ปีงบประมาณ'),
    ชื่อผู้ชนะ: looksLikeWinnerName(winner) ? winner : '',
    เลขนิติบุคคล: looksLikeTin(tin) ? tin : '',
    'ราคาตกลงซื้อ/จ้าง': price,
    'งบสัญญา(บาท)': get('งบสัญญา(บาท)'),
    วันที่ลงนามสัญญา: signDate === 'ระหว่างดำเนินการ' ? signDate : signDate,
    วันที่ประกาศ: get('วันที่ประกาศ'),
    เลขที่สัญญา: contractNo || '',
    วันที่สิ้นสุดสัญญา: endDate || '',
    สถานะสัญญา: get('เขต/อำเภอ(Eng)') === 'ระหว่างดำเนินการ' ? 'ระหว่างดำเนินการ' : get('สถานะสัญญา'),
  };
}
