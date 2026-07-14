/** Shared work-category classifier (client + server safe). */

export type WorkCategoryId =
  | 'road_concrete'
  | 'road_asphalt'
  | 'drainage'
  | 'water_supply'
  | 'building'
  | 'bridge'
  | 'vehicle'
  | 'equipment'
  | 'waste'
  | 'electrical'
  | 'it_comms'
  | 'medical'
  | 'other';

export const WORK_CATEGORY_DEFS: { id: WorkCategoryId; label: string; re: RegExp; hint: string }[] = [
  {
    id: 'road_concrete',
    label: 'ถนนคอนกรีต / คสล.',
    re: /คสล|คอนกรีตเสริมเหล็ก|ถนนคอนกรีต|ผิวจราจร.*คอนกรีต|คอนกรีตถนน/i,
    hint: 'ถนน คสล. ผิวจราจรคอนกรีต',
  },
  {
    id: 'road_asphalt',
    label: 'ถนนลาดยาง / แอสฟัลต์',
    re: /ลาดยาง|แอสฟัลต์|asphalt|overlay|เสริมผิว/i,
    hint: 'ลาดยาง แอสฟัลต์ เสริมผิว',
  },
  {
    id: 'drainage',
    label: 'ระบายน้ำ / ท่อ / บ่อพัก',
    re: /ระบายน้ำ|ท่อระบาย|บ่อพัก|รางน้ำ|คูคลอง|ท่อเหลี่ยม/i,
    hint: 'ท่อระบาย บ่อพัก รางน้ำ',
  },
  {
    id: 'water_supply',
    label: 'ประปา / บาดาล',
    re: /ประปา|บาดาล|ระบบน้ำ|ถังน้ำ|สถานีสูบ/i,
    hint: 'ประปา บาดาล ระบบน้ำ',
  },
  {
    id: 'bridge',
    label: 'สะพาน / ท่อลอด',
    re: /สะพาน|ท่อลอด|สะพานลอย/i,
    hint: 'สะพาน ท่อลอด',
  },
  {
    id: 'building',
    label: 'อาคาร / ก่อสร้างสิ่งปลูกสร้าง',
    re: /อาคาร|เมรุ|ศาลา|ห้องน้ำ|ศูนย์พัฒนา|ก่อสร้าง.*บ้าน|ปรับปรุงอาคาร|หลังคา|พื้นอาคาร/i,
    hint: 'อาคาร ศาลา เมรุ ศูนย์พัฒนา',
  },
  {
    id: 'vehicle',
    label: 'ยานพาหนะ',
    re: /รถบรรทุก|รถยนต์|ยานพาหนะ|รถกระบะ|รถขยะ|รถดับเพลิง|จักรยานยนต์/i,
    hint: 'รถยนต์ รถบรรทุก รถขยะ',
  },
  {
    id: 'waste',
    label: 'จัดการขยะ / สิ่งปฏิกูล',
    re: /ขยะ|สิ่งปฏิกูล|กำจัดขยะ|มูลฝอย/i,
    hint: 'ขยะ สิ่งปฏิกูล',
  },
  {
    id: 'electrical',
    label: 'ไฟฟ้า / แสงสว่าง',
    re: /ไฟฟ้า|โคมไฟ|สายไฟฟ้า|หม้อแปลง|ไฟฟ้าส่องสว่าง|ไฟทาง/i,
    hint: 'ไฟฟ้า โคมไฟ สายไฟ',
  },
  {
    id: 'it_comms',
    label: 'คอมพิวเตอร์ / สื่อสาร',
    re: /คอมพิวเตอร์|โน้ตบุ๊ก|เซิร์ฟเวอร์|อินเทอร์เน็ต|กล้องวงจรปิด|cctv|ซอฟต์แวร์/i,
    hint: 'คอมพิวเตอร์ CCTV ซอฟต์แวร์',
  },
  {
    id: 'medical',
    label: 'การแพทย์ / เวชภัณฑ์',
    re: /เวชภัณฑ์|เครื่องมือแพทย์|ยา |วัคซีน|ทันตกรรม|ห้องผ่าตัด/i,
    hint: 'เวชภัณฑ์ เครื่องมือแพทย์',
  },
  {
    id: 'equipment',
    label: 'ครุภัณฑ์ทั่วไป',
    re: /ครุภัณฑ์|เครื่องปรับอากาศ|เครื่องถ่ายเอกสาร|เฟอร์นิเจอร์|โต๊ะ|ตู้/i,
    hint: 'ครุภัณฑ์ เครื่องปรับอากาศ',
  },
];

export function categorizeWork(projectName: string): { id: WorkCategoryId; label: string } {
  const name = String(projectName || '');
  for (const def of WORK_CATEGORY_DEFS) {
    if (def.re.test(name)) return { id: def.id, label: def.label };
  }
  return { id: 'other', label: 'งานจัดซื้อจัดจ้างอื่น' };
}

export function formatBahtTh(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' บาท';
}
