/**
 * Auto-fetch municipal executives from the agency website when the related pack
 * has none yet, then persist into data/related (or /tmp on Vercel).
 */
import 'server-only';

import { websiteForAgency } from '@/lib/agency-websites';
import { fetchAgencyExecutives } from './fetch-executives';
import {
  getOrEmptyRelatedPack,
  loadRelatedPartyPack,
  saveRelatedPartyPack,
} from './related-party-store';
import type { RelatedPartyPack } from './related-party';

export type EnsureExecutivesResult = {
  attempted: boolean;
  saved: boolean;
  executives: number;
  note: string;
  pack: RelatedPartyPack;
};

export async function ensureAgencyExecutives(opts: {
  agencyId: string;
  agencyName: string;
  web?: string | null;
  url?: string | null;
  /** Skip if pack already has executives (default true). */
  onlyIfEmpty?: boolean;
}): Promise<EnsureExecutivesResult> {
  const onlyIfEmpty = opts.onlyIfEmpty !== false;
  const existing = loadRelatedPartyPack(opts.agencyId);
  if (onlyIfEmpty && existing?.executives?.length) {
    return {
      attempted: false,
      saved: false,
      executives: existing.executives.length,
      note: 'มีทำเนียบในแคชแล้ว',
      pack: existing,
    };
  }

  const web = opts.web || websiteForAgency(opts.agencyId) || '';
  if (!web && !opts.url) {
    const pack = existing || getOrEmptyRelatedPack(opts.agencyId);
    return {
      attempted: false,
      saved: false,
      executives: pack.executives.length,
      note: 'ยังไม่มีเว็บไซต์หน่วยงาน — ใส่ web ในแคตตาล็อกหรือ KNOWN_AGENCY_WEBSITES',
      pack,
    };
  }

  const result = await fetchAgencyExecutives({
    agencyId: opts.agencyId,
    agencyName: opts.agencyName,
    url: opts.url || null,
    web: web || null,
  });

  const base = existing || getOrEmptyRelatedPack(opts.agencyId);
  if (!result.executives.length) {
    return {
      attempted: true,
      saved: false,
      executives: 0,
      note: result.note,
      pack: base,
    };
  }

  const executives = [
    ...base.executives,
    ...result.executives.filter(
      (e) => !base.executives.some((x) => x.name === e.name && x.title === e.title)
    ),
  ];

  const pack = saveRelatedPartyPack(opts.agencyId, {
    ...base,
    executives,
    note: `auto · ${result.note}`,
  });

  return {
    attempted: true,
    saved: true,
    executives: pack.executives.length,
    note: `บันทึกทำเนียบอัตโนมัติ ${result.executives.length} รายการ · ${result.note}`,
    pack,
  };
}
