/**
 * Agency website + executive-page lookup.
 * Prefers data/catalog/agency-websites.json (batch-discovered), then hardcoded seeds.
 */
import fs from 'fs';
import path from 'path';

/** Hardcoded seeds / overrides (win over empty discovery misses). */
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
  /** เทศบาลนครอุบลราชธานี */
  'egp-3340101': 'cityub.go.th',
  'egp-001442300': 'cityub.go.th',
};

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
  'egp-3340101': [
    'https://www.cityub.go.th/web2029/',
    'https://www.cityub.go.th/web2029/main/executive',
    'https://www.cityub.go.th/web2029/main/structure',
  ],
  'egp-001442300': [
    'https://www.cityub.go.th/web2029/',
    'https://www.cityub.go.th/web2029/main/executive',
    'https://www.cityub.go.th/web2029/main/structure',
  ],
};

type WebsiteEntry = {
  host?: string;
  home?: string;
  executivePages?: string[];
  name?: string;
  tshort?: string;
  source?: string;
  note?: string;
};

type WebsiteFile = {
  generatedAt?: string;
  websites?: Record<string, WebsiteEntry>;
};

let fileCache: WebsiteFile | null = null;

function websitesPath() {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'catalog', 'agency-websites.json');
}

function loadWebsiteFile(): WebsiteFile {
  if (fileCache) return fileCache;
  const p = websitesPath();
  try {
    if (fs.existsSync(p)) {
      fileCache = JSON.parse(fs.readFileSync(p, 'utf8')) as WebsiteFile;
      return fileCache;
    }
  } catch {
    /* ignore corrupt file */
  }
  fileCache = { websites: {} };
  return fileCache;
}

/** Test helper / scripts may clear cache after rewriting the JSON. */
export function clearAgencyWebsiteCache() {
  fileCache = null;
}

export function websiteEntryForAgency(id: string | null | undefined): WebsiteEntry | null {
  if (!id) return null;
  const fromFile = loadWebsiteFile().websites?.[id];
  if (fromFile?.host) return fromFile;
  const host = KNOWN_AGENCY_WEBSITES[id];
  if (!host) return fromFile || null;
  return {
    host,
    home: `https://www.${host}/`,
    executivePages: KNOWN_AGENCY_EXECUTIVE_PAGES[id] || [],
    source: 'known',
  };
}

export function websiteForAgency(id: string | null | undefined, fallback = ''): string {
  if (!id) return fallback;
  const entry = websiteEntryForAgency(id);
  if (entry?.host) return entry.host;
  return KNOWN_AGENCY_WEBSITES[id] || fallback;
}

export function executivePagesForAgency(id: string | null | undefined): string[] {
  if (!id) return [];
  const known = KNOWN_AGENCY_EXECUTIVE_PAGES[id];
  if (known?.length) return known;
  const entry = websiteEntryForAgency(id);
  const pages = [...(entry?.executivePages || [])];
  if (entry?.home && !pages.includes(entry.home)) pages.unshift(entry.home);
  return pages;
}

export function agencyWebsitesStats(): { total: number; withHost: number; generatedAt?: string } {
  const file = loadWebsiteFile();
  const websites = file.websites || {};
  const withHost = Object.values(websites).filter((w) => !!w.host).length;
  // include hardcoded not already counted
  let extra = 0;
  for (const id of Object.keys(KNOWN_AGENCY_WEBSITES)) {
    if (!websites[id]?.host) extra += 1;
  }
  return {
    total: Object.keys(websites).length + extra,
    withHost: withHost + extra,
    generatedAt: file.generatedAt,
  };
}
