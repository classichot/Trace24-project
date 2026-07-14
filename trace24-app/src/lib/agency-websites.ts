/** Known municipal websites for agencies missing `web` in catalog. */
export const KNOWN_AGENCY_WEBSITES: Record<string, string> = {
  phothale: 'phothale.go.th',
  nakornnont: 'nakornnont.go.th',
  nongyaeng: 'nongyaeng.go.th',
  /** เทศบาลตำบลป่าไผ่ อ.สันทราย จ.เชียงใหม่ */
  'egp-5501408': 'paphaichiangmai.go.th',
  /** เทศบาลตำบลป่าไผ่ อ.ลี้ จ.ลำพูน */
  'egp-6510407': 'paphai.go.th',
  'egp-6501402': 'nongyaeng.go.th',
};

export function websiteForAgency(id: string | null | undefined, fallback = ''): string {
  if (!id) return fallback;
  return KNOWN_AGENCY_WEBSITES[id] || fallback;
}
