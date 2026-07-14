/**
 * Semi-auto DBD director fetch for winning contractors.
 * DBD has no public self-serve API — we:
 *  1) collect winners (name + 13-digit TIN) from the agency report
 *  2) try public profile pages (often blocked from cloud IPs)
 *  3) LLM-extract only from fetched/pasted text (never invent)
 *  4) always return draft companies + DBD links for human review before save
 */
import 'server-only';

import { chatCompletion, parseJsonLoose } from '@/lib/llm/client';
import { getLlmConfig } from '@/lib/llm/config';
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

export type WinnerCandidate = {
  name: string;
  tin: string;
  contracts: number;
  dbdUrl: string;
};

export type FetchDirectorsResult = {
  ok: boolean;
  companies: RelatedCompanyRecord[];
  winners: WinnerCandidate[];
  sources: { url: string; ok: boolean; status?: number; bytes?: number; error?: string }[];
  model: string | null;
  note: string;
  error?: string;
  scrapeBlocked?: boolean;
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
  return /login|signin|captcha|cloudflare|เข้าสู่ระบบ|กรุณาเข้าสู่ระบบ|access denied/i.test(
    `${html.slice(0, 2000)}\n${text.slice(0, 1500)}`
  );
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
    if (/^\d{1,2}\s/.test(name) || /พ\.?ศ\.?|ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?/.test(name)) {
      continue; // date-like garbage from misaligned CSV columns
    }
    const tin = String(co.reg || '').replace(/\D/g, '');
    const validTin = TIN_RE.test(tin) ? tin : '';
    if (!validTin && !JURISTIC_RE.test(name)) continue;
    rows.push({
      name,
      tin: validTin,
      contracts: co.contracts || 0,
      dbdUrl: validTin ? dbdProfileUrl(validTin) : 'https://datawarehouse.dbd.go.th/',
    });
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

function heuristicPeople(text: string): CompanyPerson[] {
  const out: CompanyPerson[] = [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (!/(กรรมการ|ผู้ถือหุ้น|กรรมการผู้จัดการ|ผู้มีอำนาจ)/.test(line)) continue;
    const m = line.match(PERSON_RE);
    if (!m) continue;
    const name = m[0].replace(/\s+/g, ' ').trim();
    const role: CompanyPerson['role'] = /ผู้ถือหุ้น/.test(line)
      ? 'shareholder'
      : /ผู้มีอำนาจ/.test(line)
        ? 'authorized'
        : 'director';
    if (out.some((p) => p.name === name && p.role === role)) continue;
    out.push({ name, role, note: 'สกัดจากข้อความ DBD (heuristic)' });
    if (out.length >= 20) break;
  }
  return out;
}

async function llmExtractPeople(
  companyName: string,
  tin: string,
  text: string,
  sourceUrl: string
): Promise<{ people: CompanyPerson[]; address?: string; model: string | null; error?: string }> {
  const cfg = getLlmConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return { people: heuristicPeople(text), model: null, error: 'LLM not configured' };
  }

  const result = await chatCompletion(
    [
      {
        role: 'system',
        content: `Extract Thai company directors/shareholders from DBD registry text for TRACE24.
Rules:
- ONLY names explicitly in the text. Never invent.
- Prefer directors (กรรมการ) and shareholders (ผู้ถือหุ้น) when labeled.
- Return JSON only.`,
      },
      {
        role: 'user',
        content: `บริษัท: ${companyName}
เลขนิติบุคคล: ${tin || '—'}
แหล่ง: ${sourceUrl}

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
    return { people: heuristicPeople(text), model: null, error: result.error };
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
      note: 'สกัดจากข้อความ DBD — รอยืนยัน',
      sourceUrl,
    });
  }

  return {
    people,
    address: parsed?.address ? String(parsed.address) : undefined,
    model: result.model,
  };
}

/** Extract from pasted DBD page text / OCR for one company. */
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
      note: 'ข้อความสั้นเกินไป — วางเนื้อหาจากหน้า DBD แล้วลองใหม่',
      error: 'paste_too_short',
    };
  }
  const tin = String(opts.tin || '').replace(/\D/g, '');
  const sourceUrl = opts.sourceUrl || (tin ? dbdProfileUrl(tin) : 'https://datawarehouse.dbd.go.th/');
  const extracted = await llmExtractPeople(opts.companyName, tin, text, sourceUrl);
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
        dbdUrl: sourceUrl,
      },
    ],
    sources: [{ url: sourceUrl, ok: true, bytes: text.length }],
    model: extracted.model,
    note: extracted.people.length
      ? `สกัดจากข้อความที่วางได้ ${extracted.people.length} คน — ตรวจก่อนบันทึก`
      : 'ไม่พบรายชื่อในข้อความที่วาง — ลองคัดลอกส่วนกรรมการจากหน้า DBD',
    error: extracted.people.length ? undefined : 'no_people',
  };
}

export async function fetchDirectorsForAgency(opts: {
  report: PipelineReportLike;
  limit?: number;
  /** Optional forced TIN list to try even if not in report */
  extraTins?: { tin: string; name?: string }[];
}): Promise<FetchDirectorsResult> {
  const winners = collectWinnerCandidates(opts.report, opts.limit ?? 10);
  for (const extra of opts.extraTins || []) {
    const tin = String(extra.tin || '').replace(/\D/g, '');
    if (!TIN_RE.test(tin)) continue;
    if (winners.some((w) => w.tin === tin)) continue;
    winners.unshift({
      name: extra.name || tin,
      tin,
      contracts: 0,
      dbdUrl: dbdProfileUrl(tin),
    });
  }

  if (!winners.length) {
    return {
      ok: false,
      companies: [],
      winners: [],
      sources: [],
      model: null,
      note: 'ยังไม่มีผู้ชนะ/เลขนิติบุคคลที่ใช้ได้ในรายงาน — สแกนหน่วยงานที่มีสัญญา หรือวางข้อความจาก DBD',
      error: 'no_winners',
    };
  }

  const sources: FetchDirectorsResult['sources'] = [];
  const companies: RelatedCompanyRecord[] = [];
  let model: string | null = null;
  let scrapeBlocked = false;
  let extractedCount = 0;

  for (const w of winners) {
    let people: CompanyPerson[] = [];
    let address: string | undefined;
    let sourceUrl = w.dbdUrl;

    if (w.tin) {
      const urls = [
        dbdProfileUrl(w.tin),
        `https://datawarehouse.dbd.go.th/company/companyProfile/${w.tin}`,
      ];
      for (const url of urls) {
        const got = await fetchPage(url);
        sources.push({
          url,
          ok: got.ok,
          status: got.status,
          bytes: got.html.length,
          error: got.error,
        });
        if (!got.ok || !got.html) continue;
        const text = htmlToText(got.html);
        if (looksLikeLoginOrBlocked(got.html, text) || text.length < 120) {
          scrapeBlocked = true;
          continue;
        }
        const extracted = await llmExtractPeople(w.name, w.tin, text, url);
        if (extracted.model) model = extracted.model;
        if (extracted.people.length) {
          people = extracted.people;
          address = extracted.address;
          sourceUrl = url;
          extractedCount += extracted.people.length;
          break;
        }
      }
    }

    companies.push({
      tin: w.tin || undefined,
      name: w.name,
      address,
      directors: people,
      sourceUrl,
      fetchedAt: new Date().toISOString(),
    });
  }

  const withPeople = companies.filter((c) => c.directors.length > 0).length;
  const noteParts = [
    `เตรียม ${companies.length} ผู้ชนะจากรายงาน`,
    withPeople
      ? `สกัดกรรมการได้ ${withPeople} บริษัท (${extractedCount} รายชื่อ)`
      : 'ยังสกัดกรรมการอัตโนมัติไม่ได้',
  ];
  if (scrapeBlocked || !withPeople) {
    noteParts.push(
      'DBD มักบล็อกเซิร์ฟเวอร์คลาวด์ — เปิดลิงก์ sourceUrl แล้ววางข้อความกรรมการในช่องด้านล่าง หรือใส่ชื่อเองใน JSON'
    );
  }
  noteParts.push('ตรวจแก้แล้วค่อยกดบันทึก');

  return {
    ok: companies.length > 0,
    companies,
    winners,
    sources,
    model,
    note: noteParts.join(' · '),
    scrapeBlocked: scrapeBlocked || withPeople === 0,
    error: companies.length ? undefined : 'empty',
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
      address: co.address || prev.address,
      sourceUrl: co.sourceUrl || prev.sourceUrl,
      directors: [...prev.directors, ...added],
    };
  }
  return out;
}
