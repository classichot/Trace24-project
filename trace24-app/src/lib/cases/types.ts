/** Org case / สำนวน for oversight workflows */

export type CaseStatus =
  | 'เปิดใหม่'
  | 'มอบหมายแล้ว'
  | 'กำลังตรวจ'
  | 'รอเอกสาร'
  | 'ส่งหัวหน้า'
  | 'ปิดเรื่อง';

export type CasePriority = 'High' | 'Medium' | 'Low';

export type CaseNote = {
  id: string;
  at: string;
  by: string;
  text: string;
};

export type CaseCitation = {
  label: string;
  url?: string | null;
  detail?: string;
};

export type OversightCase = {
  id: string;
  agencyId: string;
  agencyName: string;
  province: string;
  agencyType: string;
  title: string;
  summary: string;
  status: CaseStatus;
  priority: CasePriority;
  assignee: string;
  openedAt: string;
  updatedAt: string;
  openedBy: string;
  projectIds: string[];
  signalTags: string[];
  missingDocuments: string[];
  citations: CaseCitation[];
  notes: CaseNote[];
  /** Review priority score snapshot (not a guilt score) */
  score100?: number | null;
};

export const CASE_STATUSES: CaseStatus[] = [
  'เปิดใหม่',
  'มอบหมายแล้ว',
  'กำลังตรวจ',
  'รอเอกสาร',
  'ส่งหัวหน้า',
  'ปิดเรื่อง',
];
