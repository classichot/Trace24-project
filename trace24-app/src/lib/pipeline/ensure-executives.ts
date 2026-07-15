/**
 * Auto-fetch municipal officers (executives + division staff) from the agency
 * website when the related pack is empty or thin, then persist into data/related.
 * When the site is reachable but roster is missing/walled → R26 concealment flag.
 */
import 'server-only';

import { websiteForAgency } from '@/lib/agency-websites';
import { fetchAgencyExecutives } from './fetch-executives';
import {
  getOrEmptyRelatedPack,
  loadRelatedPartyPack,
  saveRelatedPartyPack,
} from './related-party-store';
import type { ExecutiveRosterTransparency, RelatedPartyPack } from './related-party';

/** Titles that indicate we already captured procurement-relevant staff. */
const DEPT_STAFF_TITLE_RE =
  /กองช่าง|กองคลัง|นายช่าง|เจ้าพนักงาน|เจ้าหน้าที่พัสดุ|ผู้อำนวยการกอง|หัวหน้าส่วน/;

function packLooksComplete(pack: RelatedPartyPack | null | undefined): boolean {
  const list = pack?.executives || [];
  if (list.length < 12) return false;
  return list.some((e) => DEPT_STAFF_TITLE_RE.test(e.title || ''));
}

export type EnsureExecutivesResult = {
  attempted: boolean;
  saved: boolean;
  executives: number;
  note: string;
  pack: RelatedPartyPack;
  rosterStatus?: ExecutiveRosterTransparency['status'];
  concealmentPresumption?: boolean;
};

function transparencyFromFetch(result: Awaited<ReturnType<typeof fetchAgencyExecutives>>): {
  executiveRoster: ExecutiveRosterTransparency;
} {
  return {
    executiveRoster: {
      status: result.rosterStatus,
      presumption: result.concealmentPresumption,
      note: result.note,
      checkedAt: new Date().toISOString(),
      officerPageHits: result.officerPageHits,
      evidenceUrls: result.evidenceUrls,
    },
  };
}

export async function ensureAgencyExecutives(opts: {
  agencyId: string;
  agencyName: string;
  web?: string | null;
  url?: string | null;
  /** Skip if pack already has a full officer roster (default true). */
  onlyIfEmpty?: boolean;
}): Promise<EnsureExecutivesResult> {
  const onlyIfEmpty = opts.onlyIfEmpty !== false;
  const existing = loadRelatedPartyPack(opts.agencyId);
  if (onlyIfEmpty && packLooksComplete(existing)) {
    return {
      attempted: false,
      saved: false,
      executives: existing!.executives.length,
      note: 'มีทำเนียบผู้บริหาร/เจ้าหน้าที่ในแคชแล้ว',
      pack: existing!,
      rosterStatus: 'found',
      concealmentPresumption: false,
    };
  }

  const web = opts.web || websiteForAgency(opts.agencyId) || '';
  if (!web && !opts.url) {
    const pack = existing || getOrEmptyRelatedPack(opts.agencyId);
    const next = saveRelatedPartyPack(opts.agencyId, {
      ...pack,
      transparency: {
        ...pack.transparency,
        executiveRoster: {
          status: 'no_website',
          presumption: false,
          note: 'ยังไม่มีเว็บไซต์หน่วยงานในแคตตาล็อก',
          checkedAt: new Date().toISOString(),
          officerPageHits: 0,
          evidenceUrls: [],
        },
      },
    });
    return {
      attempted: false,
      saved: true,
      executives: next.executives.length,
      note: 'ยังไม่มีเว็บไซต์หน่วยงาน — ใส่ web ในแคตตาล็อกหรือ KNOWN_AGENCY_WEBSITES',
      pack: next,
      rosterStatus: 'no_website',
      concealmentPresumption: false,
    };
  }

  const result = await fetchAgencyExecutives({
    agencyId: opts.agencyId,
    agencyName: opts.agencyName,
    url: opts.url || null,
    web: web || null,
  });

  const base = existing || getOrEmptyRelatedPack(opts.agencyId);
  const transparency = transparencyFromFetch(result);

  if (!result.executives.length) {
    // Persist R26 presumption even when no names were saved
    const pack = saveRelatedPartyPack(opts.agencyId, {
      ...base,
      transparency: {
        ...base.transparency,
        ...transparency,
      },
      note: result.concealmentPresumption
        ? `R26 · ${result.note}`
        : base.note || result.note,
    });
    return {
      attempted: true,
      saved: true,
      executives: pack.executives.length,
      note: result.note,
      pack,
      rosterStatus: result.rosterStatus,
      concealmentPresumption: result.concealmentPresumption,
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
    transparency: {
      ...base.transparency,
      ...transparency,
    },
    note: `auto · ${result.note}`,
  });

  return {
    attempted: true,
    saved: true,
    executives: pack.executives.length,
    note: `บันทึกทำเนียบผู้บริหาร/เจ้าหน้าที่อัตโนมัติ ${result.executives.length} รายการ · ${result.note}`,
    pack,
    rosterStatus: 'found',
    concealmentPresumption: false,
  };
}
