/**
 * Fill missing winners/prices by fetching e-GP ShowHTMLFile announcement pages.
 * Used in the live scan path when CKAN winner columns are empty/shifted.
 */

import {
  collectProjectAnnounceUrls,
  extractFromAnnounceUrl,
} from './announce-fallback';

const THAI_DATE_RE =
  /^\d{1,2}\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/;

export function looksLikeBadWinner(name: string | null | undefined) {
  const s = String(name || '').trim();
  if (!s || s === '—') return true;
  if (THAI_DATE_RE.test(s)) return true;
  if (/^\d{1,2}[\/\-]\d{1,2}/.test(s)) return true;
  return false;
}

export function egpAnnounceUrl(
  projectId: string,
  opts: { templateType?: string; tempAnnoun?: string; tempItemNo?: string; seqNo?: string } = {}
) {
  const templateType = opts.templateType || 'W2';
  const tempAnnoun = opts.tempAnnoun || 'A';
  const params = new URLSearchParams({
    servlet: 'gojsp',
    proc_id: 'ShowHTMLFile',
    processFlows: 'Procure',
    projectId: String(projectId),
    templateType,
    temp_Announ: tempAnnoun,
    temp_itemNo: opts.tempItemNo ?? (tempAnnoun === 'A' ? '0' : '1'),
    seqNo: opts.seqNo || '1',
  });
  return `https://process.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?${params}`;
}

/** Curated variants seen in real municipal crawls — try in order, stop on first hit. */
export const EGP_ANNOUNCE_VARIANTS = [
  { templateType: 'W2', tempAnnoun: 'A', tempItemNo: '0', seqNo: '1' },
  { templateType: 'W2', tempAnnoun: 'D', tempItemNo: '1', seqNo: '3' },
  { templateType: 'W2', tempAnnoun: 'D', tempItemNo: '1', seqNo: '2' },
  { templateType: 'W2', tempAnnoun: 'D', tempItemNo: '1', seqNo: '1' },
  { templateType: 'D2', tempAnnoun: 'D', tempItemNo: '1', seqNo: '2' },
  { templateType: 'W2', tempAnnoun: 'B', tempItemNo: '1', seqNo: '1' },
] as const;

export function candidateAnnounceUrls(project: {
  code?: string;
  timeline?: [string, string, string][];
  _sourceUrl?: string | null;
}): string[] {
  const urls = collectProjectAnnounceUrls(project);
  const code = String(project.code || '');
  if (/^\d{8,}$/.test(code)) {
    for (const v of EGP_ANNOUNCE_VARIANTS) {
      urls.push(
        egpAnnounceUrl(code, {
          templateType: v.templateType,
          tempAnnoun: v.tempAnnoun,
          tempItemNo: v.tempItemNo,
          seqNo: v.seqNo,
        })
      );
    }
  }
  return [...new Set(urls)];
}

function formatBaht(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' บาท';
}

function parseBahtLoose(s: string | undefined) {
  if (!s || s === '—') return 0;
  const n = Number(String(s).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

type MutableProject = {
  code?: string;
  name?: string;
  award?: string;
  budget?: string;
  ref?: string;
  winner?: string | null;
  announced?: string;
  timeline?: [string, string, string][];
  _sourceUrl?: string | null;
  methodShort?: string;
  [k: string]: unknown;
};

type MutableContractor = {
  name: string;
  reg: string;
  address: string;
  addrNote: string;
  addrFlag: boolean;
  contracts: number;
  total: string;
  totalN: number;
  shareNum: string;
  cats: string;
  directors: unknown[];
  related: unknown[];
  risks: unknown[];
  rows: (string | null)[][];
};

type MutableReport = {
  projects?: Record<string, MutableProject>;
  contractors?: Record<string, MutableContractor>;
  topContractors?: { id: string; name: string; value: string; n: number; pct?: string }[];
  priorityOrder?: string[];
  def?: { project?: string; contractor?: string; node?: string };
  meta?: Record<string, unknown>;
  stats?: { label: string; value: string; sub: string }[];
  stages?: [string, string][];
  sources?: { url: string; type: string; status: string; ok: boolean | null; last: string; docs: string }[];
};

async function extractFirstHit(urls: string[]) {
  for (const url of urls) {
    try {
      const parsed = await extractFromAnnounceUrl(url);
      if (parsed.winner || parsed.price != null) {
        return { ...parsed, url };
      }
    } catch {
      /* try next variant */
    }
  }
  return null;
}

/**
 * For projects missing a usable winner, fetch e-GP announcement HTML and attach
 * winners/contractors. Bounded for serverless time limits.
 */
export async function enrichReportFromEgAnnouncements(
  report: MutableReport,
  opts: { maxProjects?: number; concurrency?: number } = {}
): Promise<{ tried: number; filled: number; failed: number }> {
  const maxProjects = opts.maxProjects ?? 16;
  const concurrency = opts.concurrency ?? 3;
  const projects = report.projects || {};
  const contractors: Record<string, MutableContractor> = { ...(report.contractors || {}) };

  const missing = Object.entries(projects).filter(([, pr]) => {
    const winnerId = pr.winner;
    const winnerName = winnerId ? contractors[winnerId]?.name : '';
    return !winnerId || looksLikeBadWinner(winnerName);
  });

  const targets = missing.slice(0, maxProjects);
  let filled = 0;
  let failed = 0;

  const upsert = (
    pid: string,
    hit: { winner: string | null; price: number | null; budget: number | null; url: string }
  ) => {
    const pr = projects[pid];
    if (!pr) return;
    if (hit.price != null && (!pr.award || pr.award === '—' || parseBahtLoose(pr.award) <= 0)) {
      pr.award = formatBaht(hit.price);
    }
    if (hit.budget != null) {
      pr.budget = formatBaht(hit.budget);
      pr.ref = formatBaht(hit.budget);
    }
    if (!hit.winner) return;

    let winnerId =
      Object.entries(contractors).find(([, co]) => co.name === hit.winner)?.[0] || null;
    if (!winnerId) {
      winnerId = `c${Object.keys(contractors).length + 1}`;
      contractors[winnerId] = {
        name: hit.winner,
        reg: '—',
        address: '—',
        addrNote: 'จากประกาศผู้ชนะ e-GP (ShowHTMLFile)',
        addrFlag: false,
        contracts: 0,
        total: '—',
        totalN: 0,
        shareNum: '—',
        cats: '—',
        directors: [],
        related: [],
        risks: [],
        rows: [],
      };
    }
    const awardN = parseBahtLoose(pr.award) || hit.price || 0;
    contractors[winnerId].contracts += 1;
    contractors[winnerId].totalN += awardN;
    contractors[winnerId].total = formatBaht(contractors[winnerId].totalN);
    contractors[winnerId].rows.push([
      pid,
      pr.code || pid,
      pr.name || '',
      pr.award || formatBaht(awardN),
      String(pr.methodShort || '—'),
      String(pr.announced || '—'),
    ]);

    pr.winner = winnerId;
    pr._sourceUrl = hit.url;
    pr.timeline = [
      ...(pr.timeline || []).filter((row) => !/e-GP ShowHTMLFile|ประกาศผู้ชนะ e-GP/.test(row[1])),
      [String(pr.announced || '—'), 'ประกาศผู้ชนะ e-GP (ShowHTMLFile)', hit.url],
    ];
    filled += 1;
  };

  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async ([pid, pr]) => {
        const urls = candidateAnnounceUrls(pr);
        const hit = await extractFirstHit(urls);
        return { pid, hit };
      })
    );
    for (const { pid, hit } of results) {
      if (hit && (hit.winner || hit.price != null)) upsert(pid, hit);
      else failed += 1;
    }
  }

  // Rebuild contractor shares + tops
  const totalContracts = Object.values(contractors).reduce((s, c) => s + c.contracts, 0) || 1;
  for (const co of Object.values(contractors)) {
    co.shareNum = `${Math.round((co.contracts / totalContracts) * 1000) / 10}%`;
  }
  report.contractors = contractors;
  const top = Object.entries(contractors)
    .map(([id, co]) => ({ id, name: co.name, value: co.total, n: co.contracts }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);
  const maxN = Math.max(1, ...top.map((t) => t.n));
  report.topContractors = top.map((t) => ({
    ...t,
    pct: `${Math.round((t.n / maxN) * 100)}%`,
  }));
  if (report.def) {
    report.def.contractor = report.def.contractor || top[0]?.id || '';
  }

  const vendorStat = report.stats?.find((s) => s.label === 'ผู้รับจ้าง');
  if (vendorStat) {
    vendorStat.value = String(Object.keys(contractors).length);
    vendorStat.sub = filled ? 'จากประกาศ e-GP + สัญญา' : vendorStat.sub;
  }

  if (report.meta) {
    report.meta.announceEnrich = `e-GP ประกาศผล: เติมผู้ชนะ ${filled}/${targets.length} (ล้มเหลว ${failed})`;
    if (filled) {
      report.meta.dataGapNote = `เติมผู้ชนะจากประกาศ e-GP ได้ ${filled} โครงการ — นามสกุล/ชื่อจากประกาศสาธารณะ`;
      report.meta.dataPct = Object.keys(contractors).length ? '78%' : report.meta.dataPct;
    }
  }

  if (filled && report.stages) {
    report.stages = [
      ...report.stages.slice(0, -1),
      ['ดึงประกาศผู้ชนะ e-GP', `${filled} โครงการ`],
      report.stages[report.stages.length - 1],
    ];
  }

  if (filled) {
    report.sources = report.sources || [];
    report.sources.push({
      url: 'https://process.gprocurement.go.th/',
      type: 'e-GP · ประกาศผู้ชนะ (ShowHTMLFile)',
      status: 'เติมอัตโนมัติตอนสแกน',
      ok: true,
      last: 'เพิ่งดึงข้อมูล',
      docs: String(filled),
    });
  }

  return { tried: targets.length, filled, failed };
}
