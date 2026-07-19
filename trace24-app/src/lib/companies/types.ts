/**
 * Open-DBD–shaped company master — TIN (เลขนิติบุคคล 13 หลัก) is the primary key.
 *
 * Architecture:
 *   1) Seed from contracts-cache (e-GP / ภาษีไปไหน open data)
 *   2) Enrich from open references (DataForThai / Creden) — not DBD warehouse scrape
 *   3) Future: BDEX / official DBD API for verified per-company pulls
 *
 * Scraping datawarehouse.dbd.go.th is fallback only — unstable when HTML changes.
 */

import type {
  CompanyAgeConfidence,
  CompanyAgePrecision,
  CompanyAgeSource,
  CompanyPerson,
} from '@/lib/pipeline/related-party';

export type CompanySourceKind =
  | 'contracts-cache'
  | 'dataforthai'
  | 'creden'
  | 'egp'
  | 'dbd-open'
  | 'bdex'
  | 'manual'
  | 'related-pack';

export type CompanySourceRef = {
  kind: CompanySourceKind;
  url?: string;
  fetchedAt: string;
  note?: string;
};

export type CompanyMasterRecord = {
  /** 13-digit juristic ID — primary key */
  tin: string;
  name: string;
  aliases: string[];
  address?: string;
  directors: CompanyPerson[];
  registeredAt?: string | null;
  registeredAtPrecision?: CompanyAgePrecision;
  registeredAtSource?: CompanyAgeSource;
  registeredAtSourceUrl?: string;
  registeredAtQuote?: string;
  registeredAtConfidence?: CompanyAgeConfidence;
  registeredAtNote?: string;
  registeredCapital?: number | null;
  sources: CompanySourceRef[];
  /** Agencies seen winning contracts (from cache stubs) */
  seenAgencyIds: string[];
  contractWinCount: number;
  createdAt: string;
  updatedAt: string;
  /**
   * draft = from open procurement / open web refs
   * open_dbd = aligned with Open-DBD fields
   * bdex = verified via official BDEX/DBD API (future)
   */
  confidence: 'draft' | 'open_dbd' | 'bdex';
  note?: string;
};

export function normalizeTin(raw: string | null | undefined): string | null {
  const t = String(raw || '').replace(/\D/g, '');
  return /^\d{13}$/.test(t) ? t : null;
}
