/**
 * egp-contact columns are often shifted on data.go.th:
 *   พิกัดของโครงการ → TIN, ละติจูดโครงการ → winner name
 */
const THAI_DATE_RE =
  /^\d{1,2}\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/;

export function looksLikeThaiDate(s: unknown): boolean {
  const t = String(s || '').trim();
  if (!t) return false;
  if (THAI_DATE_RE.test(t)) return true;
  if (/^\d{1,2}[\/\-]\d{1,2}/.test(t)) return true;
  return false;
}

export function looksLikeTin(s: unknown): boolean {
  return /^\d{13}$/.test(String(s || '').replace(/\D/g, ''));
}

export function looksLikeWinnerName(s: unknown): boolean {
  const t = String(s || '').trim();
  if (!t || t.length < 2) return false;
  if (looksLikeThaiDate(t)) return false;
  if (/^\d+(\.\d+)?$/.test(t)) return false;
  if (/^POINT|^LINESTRING|^POLYGON/i.test(t)) return false;
  return true;
}

export function normalizeEgpContactRow(row: Record<string, unknown>): Record<string, string> {
  const get = (k: string) => {
    const v = row[k];
    return v == null ? '' : String(v).trim();
  };

  let winner = get('ชื่อผู้ชนะ');
  let tin = get('เลขนิติบุคคล').replace(/\D/g, '');
  const geoTin = get('พิกัดของโครงการ').replace(/\D/g, '');
  const geoWinner = get('ละติจูดโครงการ');
  const geoContractNo = get('ลองจิจูดโครงการ');

  if (!looksLikeWinnerName(winner) && looksLikeWinnerName(geoWinner)) winner = geoWinner;
  if (!looksLikeTin(tin) && looksLikeTin(geoTin)) tin = geoTin.slice(0, 13);

  let price = get('ราคาตกลงซื้อ/จ้าง') || get('งบสัญญา(บาท)');
  const contractNoField = get('เลขที่สัญญา');
  if ((!price || !/^\d/.test(price)) && /^\d+(\.\d+)?$/.test(contractNoField)) {
    price = contractNoField;
  }

  let signDate = get('วันที่ลงนามสัญญา');
  if (!signDate || signDate === 'ระหว่างดำเนินการ') {
    const alt = get('เลขนิติบุคคล');
    if (looksLikeThaiDate(alt)) signDate = alt;
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
    วันที่ลงนามสัญญา: signDate,
    วันที่ประกาศ: get('วันที่ประกาศ'),
    เลขที่สัญญา: geoContractNo || contractNoField || '',
  };
}
