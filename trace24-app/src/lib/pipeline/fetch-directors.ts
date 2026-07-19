/**
 * Multi-source director/shareholder fetch for winning contractors.
 *
 * Cascade (stop on first useful hit per company):
 *   0) Company master (Open-DBD–shaped, TIN PK) — no scrape
 *   1) DataForThai (open reference)
 *   2) Creden
 *   3) e-GP winner announce + linked contract/doc URLs from the report
 *   4) DBD public profile — fallback only (HTML may change)
 * Fallback: paste text from any sourceUrl in the related tab.
 *
 * Never invent names. Always treat results as draft from public sources.
 * Preferred long-term: Open-DBD dump + BDEX API — not warehouse scraping.
 */
import 'server-only';

import { companyToRelated } from '@/lib/companies/bridge';
import { loadCompany, upsertCompany } from '@/lib/companies/store';
import { chatCompletion, parseJsonLoose } from '@/lib/llm/client';
import { getLlmConfig } from '@/lib/llm/config';
import { candidateAnnounceUrls } from './announce-enrich';
import { fetchAnnouncePlain } from './announce-fallback';
import type { PipelineReportLike } from './types';
import type { CompanyPerson, RelatedCompanyRecord } from './related-party';

const UA = {
  'User-Agent':
    'Mozilla/5.0 (compatible; TRACE24/1.3; +https://trace24-app.vercel.app; public integrity research)',
  Accept: 'text/html,application/xhtml+xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
  'Accept-Language': 'th,en;q=0.8',
};

const JURISTIC_RE = /(บริษัท|ห้างหุ้นส่วน|หจก|จำกัด|บจก|บมจ)/i;
const TIN_RE = /^\d{13}$/;
const PERSON_RE = /(นาย|นางสาว|นาง|ว่าที่)\s*[\u0E00-\u0E7F.]+\s+[\u0E00-\u0E7F.]+/;

export type DirectorSourceKind =
  | 'company_master'
  | 'dataforthai'
  | 'creden'
  | 'egp'
  | 'contract_doc'
  | 'dbd'
  | 'paste';

export const PUBLIC_SOURCE_DISCLAIMER =
  'ข้อมูลกรรมการ/ผู้ถือหุ้นมาจาก company master (TIN) + แหล่งเปิด (DataForThai · Creden · e-GP) — DBD warehouse scrape เป็นทางเลือกรอง · ยืนยันทางการผ่าน BDEX/บอจ.5 เมื่อพร้อม';

export type WinnerCandidate = {
  name: string;
  tin: string;
  contracts: number;
  dbdUrl: string;
  dataforthaiUrl?: string;
  credenUrl?: string;
  egpUrls?: string[];
  docUrls?: string[];
};

export type FetchDirectorsResult = {
  ok: boolean;
  companies: RelatedCompanyRecord[];
  winners: WinnerCandidate[];
  sources: {
    url: string;
    ok: boolean;
    status?: number;
    bytes?: number;
    error?: string;
    kind?: DirectorSourceKind;
  }[];
  model: string | null;
  note: string;
  error?: string;
  scrapeBlocked?: boolean;
  disclaimer: string;
};

export function dbdProfileUrl(tin: string): string {
  const t = tin.replace(/\D/g, '');
  if (TIN_RE.test(t)) return `https://datawarehouse.dbd.go.th/company/profile/1/${t}`;
  return 'https://datawarehouse.dbd.go.th/';
}

export function dbdSearchUrl(name: string): string {
  const q = encodeURIComponent(name.trim());
  return `https://datawarehouse.dbd.go.th/company/profile/${q}`;
}

export function dataforthaiProfileUrl(tin: string): string {
  return `https://www.dataforthai.com/company/${tin.replace(/\D/g, '')}/`;
}

export function credenProfileUrl(tin: string): string {
  return `https://data.creden.co/company/general/${tin.replace(/\D/g, '')}`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6]|br|section|article|td|th)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeLoginOrBlocked(html: string, text: string): boolean {
  const head = `${html.slice(0, 2500)}\n${text.slice(0, 1800)}`;
  // Real bot/login walls — do not treat nav "เข้าสู่ระบบ" /login links as blocked
  if (/cloudflare|just a moment|enable javascript and cookies|captcha|access denied/i.test(head)) {
    return true;
  }
  if (/กรุณาเข้าสู่ระบบ/i.test(head) && text.length < 1000) return true;
  if (
    text.length < 1400 &&
    /เข้าสู่ระบบ|sign\s*in|log\s*in/i.test(text) &&
    !/(กรรมการ|ผู้ถือหุ้น|จดทะเบียน|เลขทะเบียน)/i.test(text)
  ) {
    return true;
  }
  return false;
}

function sourceLabel(kind: DirectorSourceKind): string {
  switch (kind) {
    case 'company_master':
      return 'Company master (TIN / Open-DBD)';
    case 'dataforthai':
      return 'DataForThai';
    case 'creden':
      return 'Creden';
    case 'egp':
      return 'e-GP';
    case 'contract_doc':
      return 'เอกสารผู้ชนะ/สัญญา';
    case 'dbd':
      return 'DBD (fallback)';
    case 'paste':
      return 'ข้อความที่วาง';
  }
}

function preferredSourceUrl(w: WinnerCandidate): string {
  // Prefer URLs that usually open in a browser even when cloud scrape is blocked
  if (w.tin) return dataforthaiProfileUrl(w.tin);
  if (w.credenUrl) return w.credenUrl;
  if (w.egpUrls?.[0]) return w.egpUrls[0];
  return w.dbdUrl;
}

function publicSourceLinks(w: WinnerCandidate): string[] {
  const links = [
    w.dataforthaiUrl,
    w.credenUrl,
    w.dbdUrl,
    ...(w.egpUrls || []).slice(0, 2),
  ].filter(Boolean) as string[];
  return [...new Set(links)];
}

function collectDocAndEgpUrls(
  report: PipelineReportLike,
  winner: WinnerCandidate
): { egpUrls: string[]; docUrls: string[] } {
  const egpUrls: string[] = [];
  const docUrls: string[] = [];
  const contractors = (report.contractors || {}) as Record<string, { name?: string; reg?: string }>;
  const projects = (report.projects || {}) as Record<
    string,
    {
      winner?: string | null;
      code?: string;
      timeline?: [string, string, string][];
      _sourceUrl?: string | null;
    }
  >;

  const winnerIds = new Set<string>();
  for (const [id, co] of Object.entries(contractors)) {
    const tin = String(co.reg || '').replace(/\D/g, '');
    const name = String(co.name || '').replace(/\s+/g, ' ').trim();
    if (winner.tin && tin === winner.tin) winnerIds.add(id);
    else if (name && name === winner.name) winnerIds.add(id);
  }

  for (const pr of Object.values(projects)) {
    if (!pr.winner || !winnerIds.has(pr.winner)) continue;
    if (pr._sourceUrl && /^https?:\/\//i.test(pr._sourceUrl)) {
      egpUrls.push(pr._sourceUrl);
    }
    for (const url of candidateAnnounceUrls(pr).slice(0, 4)) {
      egpUrls.push(url);
    }
    for (const row of pr.timeline || []) {
      const url = String(row[2] || '');
      if (!/^https?:\/\//i.test(url)) continue;
      const label = String(row[1] || '');
      if (/e-GP|ประกาศผู้ชนะ|gprocurement/i.test(`${label} ${url}`)) egpUrls.push(url);
      else if (/สัญญา|เอกสาร|แนบ|TOR|PDF|\.pdf/i.test(`${label} ${url}`)) docUrls.push(url);
      else if (/\.pdf($|\?)/i.test(url)) docUrls.push(url);
    }
  }

  return {
    egpUrls: [...new Set(egpUrls)].slice(0, 4),
    docUrls: [...new Set(docUrls)].slice(0, 3),
  };
}

export function collectWinnerCandidates(
  report: PipelineReportLike,
  limit = 12
): WinnerCandidate[] {
  const contractors = (report.contractors || {}) as Record<
    string,
    { name?: string; reg?: string; contracts?: number }
  >;
  const rows: WinnerCandidate[] = [];
  for (const co of Object.values(contractors)) {
    const name = String(co.name || '').replace(/\s+/g, ' ').trim();
    if (!name || name === '—' || name.length < 3) continue;
    if (
      /^\d{1,2}\s/.test(name) ||
      /พ\.?ศ\.?|ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?/.test(
        name
      )
    ) {
      continue;
    }
    const tin = String(co.reg || '').replace(/\D/g, '');
    const validTin = TIN_RE.test(tin) ? tin : '';
    if (!validTin && !JURISTIC_RE.test(name)) continue;
    const base: WinnerCandidate = {
      name,
      tin: validTin,
      contracts: co.contracts || 0,
      dbdUrl: validTin ? dbdProfileUrl(validTin) : 'https://datawarehouse.dbd.go.th/',
      dataforthaiUrl: validTin ? dataforthaiProfileUrl(validTin) : undefined,
      credenUrl: validTin ? credenProfileUrl(validTin) : undefined,
    };
    const links = collectDocAndEgpUrls(report, base);
    base.egpUrls = links.egpUrls;
    base.docUrls = links.docUrls;
    rows.push(base);
  }

  rows.sort((a, b) => {
    const sa = (a.tin ? 100 : 0) + (JURISTIC_RE.test(a.name) ? 50 : 0) + a.contracts;
    const sb = (b.tin ? 100 : 0) + (JURISTIC_RE.test(b.name) ? 50 : 0) + b.contracts;
    return sb - sa;
  });

  const seen = new Set<string>();
  const out: WinnerCandidate[] = [];
  for (const r of rows) {
    const key = r.tin || r.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchPage(url: string): Promise<{
  ok: boolean;
  status: number;
  html: string;
  error?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch(url, {
      headers: UA,
      redirect: 'follow',
      signal: controller.signal,
    });
    const html = await res.text();
    if (!res.ok) return { ok: false, status: res.status, html: '', error: `HTTP ${res.status}` };
    return { ok: true, status: res.status, html };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch failed';
    return { ok: false, status: 0, html: '', error: msg.includes('abort') ? 'timeout' : msg };
  } finally {
    clearTimeout(timer);
  }
}

function heuristicPeople(text: string, sourceUrl: string, kind: DirectorSourceKind): CompanyPerson[] {
  const out: CompanyPerson[] = [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (!/(กรรมการ|ผู้ถือหุ้น|กรรมการผู้จัดการ|ผู้มีอำนาจ|ผู้ลงนาม|หุ้นส่วนผู้จัดการ)/.test(line)) {
      continue;
    }
    const m = line.match(PERSON_RE);
    if (!m) continue;
    const name = m[0].replace(/\s+/g, ' ').trim();
    const role: CompanyPerson['role'] = /ผู้ถือหุ้น/.test(line)
      ? 'shareholder'
      : /ผู้มีอำนาจ|ผู้ลงนาม/.test(line)
        ? 'authorized'
        : 'director';
    if (out.some((p) => p.name === name && p.role === role)) continue;
    out.push({
      name,
      role,
      note: `สกัดจาก${sourceLabel(kind)} (heuristic) — แหล่งสาธารณะ รอยืนยัน`,
      sourceUrl,
    });
    if (out.length >= 20) break;
  }
  return out;
}

async function llmExtractPeople(
  companyName: string,
  tin: string,
  text: string,
  sourceUrl: string,
  kind: DirectorSourceKind
): Promise<{ people: CompanyPerson[]; address?: string; model: string | null; error?: string }> {
  const cfg = getLlmConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return { people: heuristicPeople(text, sourceUrl, kind), model: null, error: 'LLM not configured' };
  }

  const result = await chatCompletion(
    [
      {
        role: 'system',
        content: `Extract Thai company directors/shareholders (and authorized signatories if labeled) from public registry or procurement text for TRACE24.
Rules:
- ONLY names explicitly in the text. Never invent.
- Prefer directors (กรรมการ) and shareholders (ผู้ถือหุ้น) when labeled.
- From e-GP/contract text, also capture ผู้มีอำนาจลงนาม / กรรมการผู้จัดการ if present.
- Return JSON only.`,
      },
      {
        role: 'user',
        content: `บริษัท: ${companyName}
เลขนิติบุคคล: ${tin || '—'}
แหล่ง (${sourceLabel(kind)}): ${sourceUrl}

ข้อความ:
---
${text.slice(0, 12000)}
---

ตอบ JSON:
{
  "directors": [
    { "name": "นาย...", "role": "director|shareholder|authorized|other", "sharePct": null }
  ],
  "address": "ที่อยู่จดทะเบียนถ้ามี หรือ null",
  "notes": "สั้น ๆ"
}
ถ้าไม่พบชื่อคน ให้ directors เป็น []`,
      },
    ],
    { temperature: 0.05, maxTokens: 1400, json: true }
  );

  if (!result.ok) {
    return { people: heuristicPeople(text, sourceUrl, kind), model: null, error: result.error };
  }

  const parsed = parseJsonLoose<{
    directors?: { name?: string; role?: string; sharePct?: number | null }[];
    address?: string | null;
  }>(result.content);

  const people: CompanyPerson[] = [];
  for (const row of parsed?.directors || []) {
    const name = String(row.name || '').replace(/\s+/g, ' ').trim();
    if (!name || name.length < 4) continue;
    const nameCore = name.replace(/^(นาย|นางสาว|นาง|ว่าที่\s*ร\.ต\.|ดร\.)\s*/i, '').trim();
    if (nameCore.length >= 2 && !text.includes(nameCore.split(/\s+/)[0]!) && !text.includes(name)) {
      continue;
    }
    const roleRaw = String(row.role || 'director');
    const role: CompanyPerson['role'] =
      roleRaw === 'shareholder' || roleRaw === 'authorized' || roleRaw === 'other'
        ? roleRaw
        : 'director';
    people.push({
      name,
      role,
      sharePct: typeof row.sharePct === 'number' ? row.sharePct : null,
      note: `สกัดจาก${sourceLabel(kind)} — แหล่งสาธารณะ รอยืนยันกับ DBD/บอจ.5`,
      sourceUrl,
    });
  }

  return {
    people: people.length ? people : heuristicPeople(text, sourceUrl, kind),
    address: parsed?.address ? String(parsed.address) : undefined,
    model: result.model,
  };
}

type PageHit = {
  people: CompanyPerson[];
  address?: string;
  sourceUrl: string;
  kind: DirectorSourceKind;
  model: string | null;
  blocked?: boolean;
};

async function tryHtmlSource(opts: {
  url: string;
  kind: DirectorSourceKind;
  companyName: string;
  tin: string;
  sources: FetchDirectorsResult['sources'];
  /** Skip LLM if page text lacks person/role cues (saves budget). */
  requireCue?: boolean;
}): Promise<PageHit | null> {
  const got = await fetchPage(opts.url);
  opts.sources.push({
    url: opts.url,
    ok: got.ok,
    status: got.status,
    bytes: got.html.length,
    error: got.error,
    kind: opts.kind,
  });
  if (!got.ok || !got.html) return null;
  const text = htmlToText(got.html);
  if (looksLikeLoginOrBlocked(got.html, text) || text.length < 80) {
    return { people: [], sourceUrl: opts.url, kind: opts.kind, model: null, blocked: true };
  }
  if (opts.requireCue !== false) {
    if (!/(กรรมการ|ผู้ถือหุ้น|ผู้มีอำนาจ|หุ้นส่วนผู้จัดการ|กรรมการผู้จัดการ)/.test(text) && !PERSON_RE.test(text)) {
      return null;
    }
  }
  const extracted = await llmExtractPeople(opts.companyName, opts.tin, text, opts.url, opts.kind);
  if (!extracted.people.length) return null;
  return {
    people: extracted.people,
    address: extracted.address,
    sourceUrl: opts.url,
    kind: opts.kind,
    model: extracted.model,
  };
}

async function tryEgpPlainSource(opts: {
  url: string;
  kind: DirectorSourceKind;
  companyName: string;
  tin: string;
  sources: FetchDirectorsResult['sources'];
}): Promise<PageHit | null> {
  try {
    const plain = await fetchAnnouncePlain(opts.url);
    opts.sources.push({
      url: opts.url,
      ok: plain.length > 40,
      bytes: plain.length,
      kind: opts.kind,
      error: plain.length > 40 ? undefined : 'empty_announce',
    });
    if (plain.length < 80 || /ค้นหาไฟล์เอกสารไม่พบ/.test(plain)) return null;
    if (!/(กรรมการ|ผู้ถือหุ้น|ผู้มีอำนาจ|ผู้ลงนาม|หุ้นส่วน)/.test(plain)) {
      // Announce pages rarely list directors — skip LLM if no cue
      return null;
    }
    const extracted = await llmExtractPeople(
      opts.companyName,
      opts.tin,
      plain,
      opts.url,
      opts.kind
    );
    if (!extracted.people.length) return null;
    return {
      people: extracted.people,
      address: extracted.address,
      sourceUrl: opts.url,
      kind: opts.kind,
      model: extracted.model,
    };
  } catch (e) {
    opts.sources.push({
      url: opts.url,
      ok: false,
      kind: opts.kind,
      error: e instanceof Error ? e.message : 'egp fetch failed',
    });
    return null;
  }
}

/** Extract from pasted registry / บอจ.5 / Creden / DataForThai page text. */
export async function extractDirectorsFromPaste(opts: {
  companyName: string;
  tin?: string;
  text: string;
  sourceUrl?: string;
}): Promise<FetchDirectorsResult> {
  const text = opts.text.trim();
  if (text.length < 40) {
    return {
      ok: false,
      companies: [],
      winners: [],
      sources: [],
      model: null,
      note: 'ข้อความสั้นเกินไป — วางเนื้อหาจาก DataForThai / Creden / DBD / บอจ.5 แล้วลองใหม่',
      error: 'paste_too_short',
      disclaimer: PUBLIC_SOURCE_DISCLAIMER,
    };
  }
  const tin = String(opts.tin || '').replace(/\D/g, '');
  const sourceUrl =
    opts.sourceUrl ||
    (TIN_RE.test(tin) ? dataforthaiProfileUrl(tin) : 'https://datawarehouse.dbd.go.th/');
  const extracted = await llmExtractPeople(opts.companyName, tin, text, sourceUrl, 'paste');
  const company: RelatedCompanyRecord = {
    tin: TIN_RE.test(tin) ? tin : undefined,
    name: opts.companyName,
    address: extracted.address,
    directors: extracted.people,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
  };
  return {
    ok: extracted.people.length > 0,
    companies: [company],
    winners: [
      {
        name: opts.companyName,
        tin: TIN_RE.test(tin) ? tin : '',
        contracts: 0,
        dbdUrl: TIN_RE.test(tin) ? dbdProfileUrl(tin) : 'https://datawarehouse.dbd.go.th/',
        dataforthaiUrl: TIN_RE.test(tin) ? dataforthaiProfileUrl(tin) : undefined,
        credenUrl: TIN_RE.test(tin) ? credenProfileUrl(tin) : undefined,
      },
    ],
    sources: [{ url: sourceUrl, ok: true, bytes: text.length, kind: 'paste' }],
    model: extracted.model,
    note: extracted.people.length
      ? `สกัดจากข้อความที่วางได้ ${extracted.people.length} คน — ${PUBLIC_SOURCE_DISCLAIMER}`
      : 'ไม่พบรายชื่อในข้อความที่วาง — ลองคัดลอกส่วนกรรมการ/ผู้ถือหุ้นจากหน้าต้นทาง',
    error: extracted.people.length ? undefined : 'no_people',
    disclaimer: PUBLIC_SOURCE_DISCLAIMER,
  };
}

export async function fetchDirectorsForAgency(opts: {
  report: PipelineReportLike;
  limit?: number;
  /** Optional forced TIN list to try even if not in report */
  extraTins?: { tin: string; name?: string }[];
}): Promise<FetchDirectorsResult> {
  const winners = collectWinnerCandidates(opts.report, opts.limit ?? 8);
  for (const extra of opts.extraTins || []) {
    const tin = String(extra.tin || '').replace(/\D/g, '');
    if (!TIN_RE.test(tin)) continue;
    if (winners.some((w) => w.tin === tin)) continue;
    winners.unshift({
      name: extra.name || tin,
      tin,
      contracts: 0,
      dbdUrl: dbdProfileUrl(tin),
      dataforthaiUrl: dataforthaiProfileUrl(tin),
      credenUrl: credenProfileUrl(tin),
    });
  }

  if (!winners.length) {
    return {
      ok: false,
      companies: [],
      winners: [],
      sources: [],
      model: null,
      note: 'ยังไม่มีผู้ชนะ/เลขนิติบุคคลที่ใช้ได้ในรายงาน — สแกนหน่วยงานที่มีสัญญา หรือวางข้อความจากแหล่งสาธารณะ',
      error: 'no_winners',
      disclaimer: PUBLIC_SOURCE_DISCLAIMER,
    };
  }

  const sources: FetchDirectorsResult['sources'] = [];
  const companies: RelatedCompanyRecord[] = [];
  let model: string | null = null;
  let scrapeBlocked = false;
  let extractedCount = 0;
  const hitKinds = new Set<DirectorSourceKind>();

  for (const w of winners) {
    let hit: PageHit | null = null;

    // 0) Company master (Open-DBD path) — prefer cached TIN record
    if (w.tin) {
      const master = loadCompany(w.tin);
      if (master?.directors?.length) {
        companies.push(companyToRelated(master));
        extractedCount += master.directors.length;
        hitKinds.add('company_master');
        sources.push({
          url: master.sources.find((s) => s.url)?.url || `company-master:${w.tin}`,
          ok: true,
          kind: 'company_master',
        });
        continue;
      }
    }

    // 1) DataForThai (open reference — not DBD warehouse scrape)
    if (w.tin && !hit) {
      const dft = await tryHtmlSource({
        url: dataforthaiProfileUrl(w.tin),
        kind: 'dataforthai',
        companyName: w.name,
        tin: w.tin,
        sources,
      });
      if (dft?.blocked) scrapeBlocked = true;
      if (dft?.people.length) hit = dft;
    }

    // 2) Creden
    if (w.tin && !hit) {
      const creden = await tryHtmlSource({
        url: credenProfileUrl(w.tin),
        kind: 'creden',
        companyName: w.name,
        tin: w.tin,
        sources,
      });
      if (creden?.blocked) scrapeBlocked = true;
      if (creden?.people.length) hit = creden;
    }

    // 3) e-GP announces
    if (!hit) {
      for (const url of w.egpUrls || []) {
        const egp = await tryEgpPlainSource({
          url,
          kind: 'egp',
          companyName: w.name,
          tin: w.tin,
          sources,
        });
        if (egp?.people.length) {
          hit = egp;
          break;
        }
      }
    }

    // 3b) linked contract / attachment URLs from report timeline
    if (!hit) {
      for (const url of w.docUrls || []) {
        const doc = /\.pdf($|\?)/i.test(url)
          ? null // PDF bytes need extract pipeline; skip silent fail for now
          : await tryHtmlSource({
              url,
              kind: 'contract_doc',
              companyName: w.name,
              tin: w.tin,
              sources,
              requireCue: true,
            });
        if (doc?.blocked) scrapeBlocked = true;
        if (doc?.people.length) {
          hit = doc;
          break;
        }
      }
    }

    // 4) DBD
    if (w.tin && !hit) {
      const dbdUrls = [
        dbdProfileUrl(w.tin),
        `https://datawarehouse.dbd.go.th/company/companyProfile/${w.tin}`,
      ];
      for (const url of dbdUrls) {
        const dbd = await tryHtmlSource({
          url,
          kind: 'dbd',
          companyName: w.name,
          tin: w.tin,
          sources,
        });
        if (dbd?.blocked) scrapeBlocked = true;
        if (dbd?.people.length) {
          hit = dbd;
          break;
        }
      }
    }

    if (hit?.model) model = hit.model;
    if (hit?.people.length) {
      extractedCount += hit.people.length;
      hitKinds.add(hit.kind);
    }

    const record: RelatedCompanyRecord = {
      tin: w.tin || undefined,
      name: w.name,
      address: hit?.address,
      directors: hit?.people || [],
      sourceUrl: hit?.sourceUrl || preferredSourceUrl(w),
      fetchedAt: new Date().toISOString(),
    };
    companies.push(record);

    // Write back into TIN company master (Open-DBD path)
    if (w.tin && (record.directors.length > 0 || record.address)) {
      upsertCompany({
        tin: w.tin,
        name: w.name,
        address: record.address,
        directors: record.directors,
        sources: [
          {
            kind:
              hit?.kind === 'dbd'
                ? 'dbd-open'
                : hit?.kind === 'creden'
                  ? 'creden'
                  : hit?.kind === 'dataforthai'
                    ? 'dataforthai'
                    : hit?.kind === 'egp' || hit?.kind === 'contract_doc'
                      ? 'egp'
                      : 'related-pack',
            url: record.sourceUrl,
            fetchedAt: record.fetchedAt || new Date().toISOString(),
            note: 'enriched via director fetch cascade',
          },
        ],
        confidence: hit?.kind === 'dbd' ? 'draft' : 'open_dbd',
      });
    }
  }

  const withPeople = companies.filter((c) => c.directors.length > 0).length;
  const kindNote = hitKinds.size
    ? `แหล่งที่สำเร็จ: ${[...hitKinds].map(sourceLabel).join(' · ')}`
    : 'ยังสกัดกรรมการอัตโนมัติไม่ได้ — ใช้ company master / วางข้อความจากแหล่งเปิด (อย่าพึ่ง scrape DBD warehouse)';

  const noteParts = [
    `ลำดับ: company master (TIN) → DataForThai → Creden → e-GP → DBD(รอง) · เตรียม ${companies.length} ผู้ชนะ`,
    withPeople
      ? `สกัดได้ ${withPeople} บริษัท (${extractedCount} รายชื่อ) · ${kindNote}`
      : kindNote,
  ];
  if (scrapeBlocked || !withPeople) {
    const sampleLinks = winners
      .slice(0, 3)
      .flatMap((w) => publicSourceLinks(w))
      .filter((u, i, arr) => arr.indexOf(u) === i)
      .slice(0, 6);
    noteParts.push(
      sampleLinks.length
        ? `เปิดลิงก์แล้ววางข้อความกรรมการ: ${sampleLinks.join(' · ')}`
        : 'เปิด sourceUrl ใน JSON → คัดลอกส่วนกรรมการ/ผู้ถือหุ้นมาวางด้านล่าง → กดสกัด'
    );
  }
  noteParts.push(PUBLIC_SOURCE_DISCLAIMER);

  return {
    ok: companies.length > 0,
    companies,
    winners,
    sources,
    model,
    note: noteParts.join(' · '),
    scrapeBlocked: scrapeBlocked || withPeople === 0,
    error: companies.length ? undefined : 'empty',
    disclaimer: PUBLIC_SOURCE_DISCLAIMER,
  };
}

export function mergeCompanyDrafts(
  existing: RelatedCompanyRecord[],
  incoming: RelatedCompanyRecord[]
): RelatedCompanyRecord[] {
  const out = [...existing];
  for (const co of incoming) {
    const tin = String(co.tin || '').replace(/\D/g, '');
    const name = (co.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const idx = out.findIndex((x) => {
      const xt = String(x.tin || '').replace(/\D/g, '');
      if (tin && xt && tin === xt) return true;
      return name && (x.name || '').replace(/\s+/g, ' ').trim().toLowerCase() === name;
    });
    if (idx < 0) {
      out.push(co);
      continue;
    }
    const prev = out[idx];
    const seen = new Set(prev.directors.map((d) => `${d.name}|${d.role}`));
    const added = co.directors.filter((d) => !seen.has(`${d.name}|${d.role}`));
    out[idx] = {
      ...prev,
      ...co,
      tin: co.tin || prev.tin,
      name: co.name || prev.name,
      address: co.address || prev.address || undefined,
      sourceUrl: co.sourceUrl || prev.sourceUrl,
      directors: [...prev.directors, ...added],
      registeredAt: co.registeredAt ?? prev.registeredAt,
      registeredAtPrecision: co.registeredAtPrecision || prev.registeredAtPrecision,
      registeredAtSource: co.registeredAtSource || prev.registeredAtSource,
      registeredAtSourceUrl: co.registeredAtSourceUrl || prev.registeredAtSourceUrl,
      registeredAtQuote: co.registeredAtQuote || prev.registeredAtQuote,
      registeredAtConfidence: co.registeredAtConfidence || prev.registeredAtConfidence,
      registeredAtNote: co.registeredAtNote || prev.registeredAtNote,
      registeredCapital: co.registeredCapital ?? prev.registeredCapital,
    };
  }
  return out;
}
