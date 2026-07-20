/** Client-safe types for the investigation observation pack. */

export type MoneyObservation = {
  id: string;
  section:
    | 'ใกล้เพดานงบ'
    | 'ค่ากลางตลาด'
    | 'กระจุกมูลค่าปีงบ'
    | 'เร่งใช้เงินปลายปี'
    | 'ซอยสัญญา/แยกงวด'
    | 'วิธีจัดหา'
    | 'อื่นๆ ด้านมูลค่า';
  ruleTag: string;
  severity: string;
  projectId: string;
  projectName: string;
  winner: string;
  award: string;
  budget: string;
  fy: string;
  text: string;
  suggestedCheck: string;
  suspicionWhy?: string;
  innocentAlternative?: string;
  whatToVerify?: string;
};

export type AuditObservationPack = {
  generatedAt: string;
  agencyId: string;
  agencyName: string;
  province: string;
  agencyType: string;
  disclaimer: string;
  summary: {
    projectCount: number;
    observationCount: number;
    bySection: Record<string, number>;
    highCount: number;
    totalAwardLabel: string;
  };
  observations: MoneyObservation[];
  topWinners: { name: string; total: string; shareHint?: string }[];
  documentRequests: string[];
  aiNarrative?: string;
  aiModel?: string;
  aiError?: string;
};

export const OBSERVATION_PACK_TITLE = 'สรุปประเด็นตั้งต้นเพื่อพิจารณาสืบสวน';
