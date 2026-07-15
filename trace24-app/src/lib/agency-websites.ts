/** Known municipal websites for agencies missing `web` in catalog. */
export const KNOWN_AGENCY_WEBSITES: Record<string, string> = {
  phothale: 'phothale.go.th',
  nakornnont: 'nakornnont.go.th',
  nongyaeng: 'nongyaeng.go.th',
  /** เทศบาลตำบลป่าไผ่ จ.เชียงใหม่ */
  'egp-5501408': 'paphaichiangmai.go.th',
  /** เทศบาลตำบลป่าไผ่ อ.ลี้ จ.ลำพูน */
  'egp-6510407': 'paphai.go.th',
  'egp-6501402': 'nongyaeng.go.th',
  /** เทศบาลตำบลเวียงเชียงแสน อ.เชียงแสน จ.เชียงราย */
  'egp-5570801': 'wiangchiangsaen.go.th',
};

/**
 * Direct ทำเนียบ / บุคลากร pages (executives + division directories).
 * Used when the site root is a splash/event gate or CMS buries staff under /officers2/*.
 */
export const KNOWN_AGENCY_EXECUTIVE_PAGES: Record<string, string[]> = {
  'egp-5501408': [
    'https://www.paphaichiangmai.go.th/index',
    'https://www.paphaichiangmai.go.th/officers2/executive_information',
    'https://www.paphaichiangmai.go.th/officers2/government',
    'https://www.paphaichiangmai.go.th/officers2/officepalad',
    'https://www.paphaichiangmai.go.th/officers2/divisionoffinance',
    'https://www.paphaichiangmai.go.th/officers2/engineeroffice',
    'https://www.paphaichiangmai.go.th/officers2/publichealth',
    'https://www.paphaichiangmai.go.th/officers2/educationoffice',
    'https://www.paphaichiangmai.go.th/officers2/officers2_20',
    'https://www.paphaichiangmai.go.th/officers2/concil_member_officer',
  ],
};

export function websiteForAgency(id: string | null | undefined, fallback = ''): string {
  if (!id) return fallback;
  return KNOWN_AGENCY_WEBSITES[id] || fallback;
}

export function executivePagesForAgency(id: string | null | undefined): string[] {
  if (!id) return [];
  return KNOWN_AGENCY_EXECUTIVE_PAGES[id] || [];
}
