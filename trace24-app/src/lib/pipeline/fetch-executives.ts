/**
 * Fetch municipal website pages and extract agency officers (executives + staff).
 * Prefers department pages (กองช่าง / กองคลัง / สำนักปลัด) for procurement COI.
 * LLM may only extract names present in page text — never invent.
 */
import 'server-only';

import { chatCompletion, parseJsonLoose } from '@/lib/llm/client';
import { getLlmConfig } from '@/lib/llm/config';
import type { AgencyExecutive } from './related-party';

import { executivePagesForAgency, KNOWN_AGENCY_WEBSITES } from '@/lib/agency-websites';

const KNOWN_WEB = KNOWN_AGENCY_WEBSITES;

const UA = {
  'User-Agent':
    'Mozilla/5.0 (compatible; TRACE24/1.3; +https://trace24-app.vercel.app) AppleWebKit/537.36',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'th,en;q=0.8',
};

/** Common CMS paths for executives + division staff directories. */
const PATH_HINTS = [
  '/index', // many .go.th sites put an event splash on `/` and the real site on /index
  '',
  '/index.php',
  '/ทำเนียบผู้บริหาร',
  '/ทำเนียบผู้บริหาร.html',
  '/โครงสร้างองค์กร',
  '/โครงสร้าง',
  '/คณะผู้บริหาร',
  '/ผู้บริหาร',
  '/ข้อมูลผู้บริหาร',
  '/officers2/executive_information',
  '/officers2/executive',
  '/officers2/government',
  '/officers2/officepalad',
  '/officers2/divisionoffinance',
  '/officers2/engineeroffice',
  '/officers2/publichealth',
  '/officers2/educationoffice',
  '/officers2/officers2_20',
  '/officers2/concil_member_officer',
  '/executive',
  '/executives',
  '/about/executive',
  '/personnel',
  '/personnel.php',
  '/personnel.php?id=12',
  '/data.php?id=14',
  '/ita/executive',
];

const LINK_RE =
  /href\s*=\s*["']([^"']+)["'][^>]*>([^<]{0,120})/gi;
const KEYWORD_RE =
  /ทำเนียบ|ผู้บริหาร|ข้อมูลผู้บริหาร|คณะผู้บริหาร|โครงสร้างองค์กร|โครงสร้างการบริหาร|หัวหน้าส่วน|นายกเทศมนตรี|ปลัดเทศบาล|กองช่าง|กองคลัง|สำนักปลัด|บุคลากร|เจ้าหน้าที่|executive|officers2|personnel|engineeroffice|divisionoffinance|officepalad|โครงสร้าง/i;

const MAX_OFFICERS = 120;

/** Event / invitation splash pages that are not the municipal site. */
function looksLikeSplashGate(html: string): boolean {
  return /เข้าสู่เว็บไซต์/i.test(html) && html.length < 25_000;
}

function discoverSiteEntryLinks(html: string, pageUrl: string): string[] {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(html))) {
    const href = m[1];
    const label = (m[2] || '').trim();
    if (!/เข้าสู่เว็บไซต์|^index$/i.test(label) && !/^index\/?$/i.test(href)) continue;
    const abs = absolutize(pageUrl, href);
    if (abs && !found.includes(abs)) found.push(abs);
  }
  return found.slice(0, 3);
}

export type FetchExecutivesResult = {
  ok: boolean;
  executives: AgencyExecutive[];
  sources: { url: string; bytes: number; ok: boolean; status?: number; error?: string }[];
  model: string | null;
  note: string;
  error?: string;
};

function normalizeHost(web: string): string {
  return String(web || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

export function resolveAgencyBaseUrls(opts: {
  url?: string | null;
  web?: string | null;
}): string[] {
  const out: string[] = [];
  const push = (u: string) => {
    try {
      const parsed = new URL(u.includes('://') ? u : `https://${u}`);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      if (parsed.pathname && parsed.pathname !== '/') {
        if (!out.includes(parsed.href)) out.push(parsed.href);
      }
      const base = `${parsed.protocol}//${parsed.host}/`;
      if (!out.includes(base)) out.push(base);
    } catch {
      /* ignore */
    }
  };

  if (opts.url) push(opts.url.trim());
  const host = normalizeHost(opts.web || '');
  if (host) {
    push(`https://www.${host}/`);
    push(`https://${host}/`);
  }
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|tr|td|th|li|h[1-6]|br|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function absolutize(base: string, href: string): string | null {
  try {
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) {
      return null;
    }
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function discoverOfficerLinks(html: string, pageUrl: string): string[] {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(html))) {
    const href = m[1];
    const label = m[2] || '';
    if (!KEYWORD_RE.test(href) && !KEYWORD_RE.test(label)) continue;
    const abs = absolutize(pageUrl, href);
    if (abs && !found.includes(abs)) found.push(abs);
  }
  return found.slice(0, 16);
}

async function fetchHtml(url: string): Promise<{ ok: boolean; status: number; html: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
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

/** Political / senior / civil-service titles useful for procurement COI. */
function looksLikeOfficerTitle(raw: string): boolean {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s.length < 4 || s.length > 72) return false;
  if (looksLikePersonName(s)) return false;
  return /^(นายกเทศมนตรี|รองนายกเทศมนตรี|เลขานุการ|ที่ปรึกษา|ปลัดเทศบาล|รองปลัดเทศบาล|หัวหน้าสำนัก|หัวหน้าส่วน|หัวหน้าฝ่าย|หัวหน้างาน|หัวหน้าหน่วย|ผู้อำนวยการ|นายช่าง|เจ้าพนักงาน|นักวิชาการ|นักจัดการ|นักวิเคราะห์|นักทรัพยากร|เจ้าหน้าที่|พนักงาน|สมาชิกสภา|ประธานสภา|รองประธานสภา|ผู้ช่วยนายก|ผู้ช่วยปลัด)/.test(
    s
  );
}

function looksLikePersonName(raw: string): boolean {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s.length < 5 || s.length > 48) return false;
  // Civil-service job titles that start with นาย… (นายช่างโยธา)
  if (/^นายช่าง/.test(s)) return false;
  if (/^นายกเทศมนตรี|^รองนายก|^ปลัดเทศบาล/.test(s)) return false;
  return /^(?:นาย|นางสาว|นาง|ว่าที่(?:\s*ร้อยตรี|\s*ร\.?\s*ต\.?)?)\s*[\u0E00-\u0E7F.]+\s+[\u0E00-\u0E7F.]+$/.test(
    s
  );
}

function dedupeOfficers(rows: AgencyExecutive[]): AgencyExecutive[] {
  const seen = new Set<string>();
  const out: AgencyExecutive[] = [];
  for (const e of rows) {
    const k = `${e.name}|${e.title}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

function pushOfficer(
  out: AgencyExecutive[],
  name: string,
  title: string,
  sourceUrl: string
): void {
  const n = name.replace(/\s+/g, ' ').trim();
  const t = normalizeTitle(title);
  if (!looksLikePersonName(n) || !looksLikeOfficerTitle(t)) return;
  if (out.some((e) => e.name === n && normalizeTitle(e.title) === t)) return;
  out.push({ name: n, title: t, sourceUrl });
}

/** CMS officer cards: <div>ชื่อ</div><div>ตำแหน่ง</div> */
function htmlCardExtract(html: string, sourceUrl: string): AgencyExecutive[] {
  const out: AgencyExecutive[] = [];
  const re =
    /<(?:div|p|td|span|h[1-6]|li)[^>]*>\s*([^<]{4,80}?)\s*<\/(?:div|p|td|span|h[1-6]|li)>\s*<(?:div|p|td|span|h[1-6]|li)[^>]*>\s*([^<]{3,80}?)\s*<\/(?:div|p|td|span|h[1-6]|li)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const a = m[1].replace(/\s+/g, ' ').trim();
    const b = m[2].replace(/\s+/g, ' ').trim();
    // CMS cards are name then title; do not reverse (avoids pairing prior title with next name)
    if (looksLikePersonName(a) && looksLikeOfficerTitle(b)) pushOfficer(out, a, b, sourceUrl);
    if (out.length >= MAX_OFFICERS) break;
  }
  return out;
}

function heuristicExtract(text: string, sourceUrl: string): AgencyExecutive[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: AgencyExecutive[] = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    if (looksLikePersonName(a) && looksLikeOfficerTitle(b)) pushOfficer(out, a, b, sourceUrl);
    if (out.length >= MAX_OFFICERS) break;
  }
  return out;
}

async function llmExtract(
  agencyName: string,
  text: string,
  sourceUrls: string[]
): Promise<{ executives: AgencyExecutive[]; model: string | null; error?: string }> {
  const cfg = getLlmConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return { executives: [], model: null, error: 'LLM not configured' };
  }

  const clipped = text.slice(0, 18000);
  const result = await chatCompletion(
    [
      {
        role: 'system',
        content: `You extract Thai municipal officers from website text for TRACE24 (procurement integrity).
Rules:
- ONLY use names and titles explicitly present in the text. Never invent or guess.
- If unsure, omit the person.
- Extract ALL named officers on the pages, not only political executives.
- Priority for corruption-risk roles: นายก/รองฯ/ปลัด, ผอ.กองช่าง, ผอ.กองคลัง, นายช่าง, เจ้าพนักงาน/เจ้าหน้าที่พัสดุ/คลัง/ช่าง, หัวหน้าส่วนราชการ, สำนักปลัด.
- Also include other division staff when listed (กองการศึกษา, สาธารณสุข, ตรวจสอบภายใน, สมาชิกสภา).
- Return JSON only.`,
      },
      {
        role: 'user',
        content: `หน่วยงาน: ${agencyName}
แหล่ง: ${sourceUrls.join(' · ') || '—'}

ข้อความจากเว็บ:
---
${clipped}
---

ตอบเป็น JSON:
{
  "executives": [
    { "name": "นาย...", "title": "ผู้อำนวยการกองช่าง", "sourceUrl": "https://..." }
  ],
  "notes": "สั้น ๆ ว่าพบจากส่วนไหน หรือว่าไม่พบ"
}
ถ้าไม่พบรายชื่อในข้อความ ให้ executives เป็น []`,
      },
    ],
    { temperature: 0.05, maxTokens: 3200, json: true }
  );

  if (!result.ok) return { executives: [], model: null, error: result.error };

  const parsed = parseJsonLoose<{
    executives?: { name?: string; title?: string; sourceUrl?: string }[];
    notes?: string;
  }>(result.content);

  const executives: AgencyExecutive[] = [];
  for (const row of parsed?.executives || []) {
    const name = String(row.name || '').replace(/\s+/g, ' ').trim();
    const title = String(row.title || '').replace(/\s+/g, ' ').trim();
    if (!looksLikePersonName(name) || !looksLikeOfficerTitle(title)) continue;
    const nameCore = name.replace(/^(นาย|นางสาว|นาง|ว่าที่\s*ร้อยตรี|ว่าที่\s*ร\.ต\.|ดร\.)\s*/i, '').trim();
    if (nameCore.length >= 3 && !text.includes(nameCore.split(/\s+/)[0] || nameCore)) {
      if (!text.includes(name) && !text.includes(nameCore)) continue;
    }
    executives.push({
      name,
      title,
      sourceUrl: row.sourceUrl || sourceUrls[0] || undefined,
    });
  }

  return { executives, model: result.model };
}

export async function fetchAgencyExecutives(opts: {
  agencyId: string;
  agencyName: string;
  url?: string | null;
  web?: string | null;
}): Promise<FetchExecutivesResult> {
  const seeds = resolveAgencyBaseUrls({
    url: opts.url,
    web: opts.web || KNOWN_WEB[opts.agencyId] || null,
  });
  const knownPages = executivePagesForAgency(opts.agencyId);
  if (!seeds.length && !knownPages.length) {
    return {
      ok: false,
      executives: [],
      sources: [],
      model: null,
      note: 'ยังไม่มี URL เว็บหน่วยงาน — ใส่ลิงก์ทำเนียบ/บุคลากรแล้วลองใหม่',
      error: 'missing_url',
    };
  }

  const candidateUrls = new Set<string>(knownPages);
  for (const seed of seeds) {
    try {
      const u = new URL(seed.includes('://') ? seed : `https://${seed}`);
      if (u.pathname && u.pathname !== '/') {
        candidateUrls.add(u.href);
      }
      const origin = `${u.protocol}//${u.host}`;
      for (const path of PATH_HINTS) {
        candidateUrls.add(`${origin}${path || '/'}`);
      }
    } catch {
      /* ignore */
    }
  }

  const sources: FetchExecutivesResult['sources'] = [];
  const textParts: string[] = [];
  const htmlByUrl = new Map<string, string>();
  const usedUrls: string[] = [];
  const discovered: string[] = [];

  // Prefer known officer pages, then /index before splash `/`
  const firstBatch = [
    ...knownPages,
    ...[...candidateUrls].filter((u) => !knownPages.includes(u)),
  ].slice(0, 22);

  for (const url of firstBatch) {
    const got = await fetchHtml(url);
    sources.push({
      url,
      bytes: got.html.length,
      ok: got.ok,
      status: got.status,
      error: got.error,
    });
    if (!got.ok || !got.html) continue;

    if (looksLikeSplashGate(got.html)) {
      discovered.push(...discoverSiteEntryLinks(got.html, url));
      continue;
    }

    discovered.push(...discoverOfficerLinks(got.html, url));
    const text = htmlToText(got.html);
    if (text.length > 80) {
      textParts.push(`### ${url}\n${text.slice(0, 8000)}`);
      htmlByUrl.set(url, got.html);
      usedUrls.push(url);
    }
  }

  // Second pass: site entry (/index) + discovered officer/division links
  for (const url of discovered.slice(0, 14)) {
    if (usedUrls.includes(url)) continue;
    const got = await fetchHtml(url);
    sources.push({
      url,
      bytes: got.html.length,
      ok: got.ok,
      status: got.status,
      error: got.error,
    });
    if (!got.ok || !got.html) continue;
    if (looksLikeSplashGate(got.html)) continue;
    discovered.push(...discoverOfficerLinks(got.html, url));
    const text = htmlToText(got.html);
    if (text.length > 80) {
      textParts.push(`### ${url}\n${text.slice(0, 8000)}`);
      htmlByUrl.set(url, got.html);
      usedUrls.push(url);
    }
  }

  const combined = textParts.join('\n\n').slice(0, 24000);
  if (!combined.trim()) {
    return {
      ok: false,
      executives: [],
      sources,
      model: null,
      note: 'ดึงหน้าเว็บไม่ได้หรือไม่มีข้อความ — ตรวจ URL / เว็บอาจบล็อกเซิร์ฟเวอร์',
      error: 'empty_pages',
    };
  }

  const heuristic: AgencyExecutive[] = [];
  for (const url of usedUrls) {
    const html = htmlByUrl.get(url);
    if (html) heuristic.push(...htmlCardExtract(html, url));
    const chunk = textParts.find((t) => t.includes(url)) || combined;
    heuristic.push(...heuristicExtract(chunk, url));
  }

  const llm = await llmExtract(opts.agencyName, combined, usedUrls);
  const executives = dedupeOfficers([...heuristic, ...llm.executives]).slice(0, MAX_OFFICERS);

  return {
    ok: executives.length > 0,
    executives,
    sources,
    model: llm.model,
    note: executives.length
      ? `สกัดได้ ${executives.length} รายการ (ผู้บริหาร+เจ้าหน้าที่กอง) จากเว็บ — ตรวจชื่อก่อนบันทึก`
      : llm.error
        ? `ไม่พบรายชื่อชัดเจน (${llm.error}) — ใส่ URL หน้าทำเนียบ/บุคลากรโดยตรงแล้วลองใหม่`
        : 'ไม่พบรายชื่อเจ้าหน้าที่ในข้อความที่ดึงได้ — ใส่ URL หน้าทำเนียบ/บุคลากรโดยตรงแล้วลองใหม่',
    error: executives.length ? undefined : 'no_executives',
  };
}
