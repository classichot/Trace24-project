import { getCatalogAgency, isCatalogAgency, listFeaturedCatalogAgencies } from './agency-catalog';
import { listCachedAgencyIds } from './pipeline/load-report';

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

/** True for curated + any national e-GP catalog agency (live public procurement unit). */
export function isRealAgency(id: string | null | undefined): id is string {
  return !!id && (REAL_AGENCY_IDS.has(id) || isCatalogAgency(id));
}

export function hasCachedAgencyReport(id: string | null | undefined): boolean {
  if (!id) return false;
  if (REAL_AGENCY_IDS.has(id)) {
    try {
      return listCachedAgencyIds().includes(id);
    } catch {
      return true;
    }
  }
  try {
    return listCachedAgencyIds().includes(id);
  } catch {
    return false;
  }
}

export function findAgency(
  id: string | null | undefined,
  mockMunis: AgencyRecord[],
  selected?: AgencyRecord | null
): AgencyRecord | undefined {
  if (!id) return undefined;
  if (selected?.id === id) return selected;
  const featured = REAL_AGENCIES.find((a) => a.id === id);
  if (featured) {
    const cat = getCatalogAgency(id);
    return cat
      ? { ...cat, ...featured, code: cat.code && cat.code !== '—' ? cat.code : featured.code, real: true }
      : featured;
  }
  return getCatalogAgency(id) ?? mockMunis.find((m) => m.id === id);
}

export function featuredAgencies(): AgencyRecord[] {
  const fromCatalog = listFeaturedCatalogAgencies();
  if (fromCatalog.length) return fromCatalog;
  return REAL_AGENCIES;
}
