export type SeverityKey = 'High' | 'Medium' | 'Low';

export function sev(s: SeverityKey | string) {
  if (s === 'High')
    return {
      sevLabel: 'สูง',
      sevColor: 'var(--accent)',
      sevBorder: 'var(--accent)',
    };
  if (s === 'Medium')
    return {
      sevLabel: 'ปานกลาง',
      sevColor: '#55554F',
      sevBorder: '#B4B4AE',
    };
  return {
    sevLabel: 'ต่ำ',
    sevColor: '#8B8B85',
    sevBorder: '#DDDDD8',
  };
}

export const REVIEW_OPTIONS = [
  'ใหม่',
  'กำลังตรวจสอบ',
  'ยืนยันปัญหาข้อมูล',
  'ต้องการข้อมูลเพิ่มเติม',
  'ปัดตก — ไม่พบปัญหา',
  'ส่งต่อเพื่อสอบสวน',
] as const;
