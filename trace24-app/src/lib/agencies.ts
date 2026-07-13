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
  aff?: string;
};

/** Curated agencies with pre-built reports (also present in national catalog). */
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
    code: '5660601',
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
    code: '3120101',
    web: 'nakornnont.go.th',
    real: true,
  },
  {
    id: 'nongyaeng',
    th: 'เทศบาลตำบลหนองแหย่ง',
    en: 'Nong Yaeng Subdistrict Municipality',
    prov: 'เชียงใหม่',
    dist: 'สันทราย',
    type: 'อปท. — เทศบาลตำบล',
    tshort: 'เทศบาลตำบล',
    loc: 'อ.สันทราย · จ.เชียงใหม่',
    code: '6501402',
    web: 'nongyaeng.go.th',
    real: true,
  },
];

export const REAL_AGENCY_IDS = new Set(REAL_AGENCIES.map((a) => a.id));

/**
 * Live public procurement unit — curated ids or national catalog ids (`egp-…`).
 * Kept client-safe (no fs / catalog imports).
 */
export function isRealAgency(id: string | null | undefined): id is string {
  return !!id && (REAL_AGENCY_IDS.has(id) || id.startsWith('egp-'));
}

export function findAgency(
  id: string | null | undefined,
  mockMunis: AgencyRecord[],
  selected?: AgencyRecord | null
): AgencyRecord | undefined {
  if (!id) return undefined;
  if (selected?.id === id) return selected;
  return REAL_AGENCIES.find((a) => a.id === id) ?? mockMunis.find((m) => m.id === id);
}

export function featuredAgencies(): AgencyRecord[] {
  return REAL_AGENCIES;
}
