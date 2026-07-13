export type AgencyRecord = {
  id: string;
  th: string;
  en: string;
  prov: string;
  dist: string;
  type: string;
  tshort: string;
  loc: string;
  code: string;
  web: string;
  real?: boolean;
};

/** Agencies backed by live public procurement data */
export const REAL_AGENCIES: AgencyRecord[] = [
  {
    id: 'phothale',
    th: 'เทศบาลตำบลโพทะเล',
    en: 'Pho Thale Subdistrict Municipality',
    prov: 'พิจิตร',
    dist: 'โพทะเล',
    type: 'อปท. — เทศบาลตำบล',
    tshort: 'เทศบาลตำบล',
    loc: 'อ.โพทะเล · จ.พิจิตร',
    code: '—',
    web: 'phothale.go.th',
    real: true,
  },
  {
    id: 'nakornnont',
    th: 'เทศบาลนครนนทบุรี',
    en: 'Nakhon Nonthaburi City Municipality',
    prov: 'นนทบุรี',
    dist: 'เมือง',
    type: 'อปท. — เทศบาลนคร',
    tshort: 'เทศบาลนคร',
    loc: 'จ.นนทบุรี',
    code: '—',
    web: 'nakornnont.go.th',
    real: true,
  },
];

export const REAL_AGENCY_IDS = new Set(REAL_AGENCIES.map((a) => a.id));

export function isRealAgency(id: string | null | undefined): id is string {
  return !!id && REAL_AGENCY_IDS.has(id);
}

export function findAgency(
  id: string | null | undefined,
  mockMunis: AgencyRecord[]
): AgencyRecord | undefined {
  if (!id) return undefined;
  return REAL_AGENCIES.find((a) => a.id === id) ?? mockMunis.find((m) => m.id === id);
}
