/**
 * Fetch municipal website pages and extract agency executives.
 * LLM may only extract names present in page text — never invent.
 */
import 'server-only';

import { chatCompletion, parseJsonLoose } from '@/lib/llm/client';
import { getLlmConfig } from '@/lib/llm/config';
import type { AgencyExecutive } from './related-party';

import { KNOWN_AGENCY_WEBSITES } from '@/lib/agency-websites';

const KNOWN_WEB = KNOWN_AGENCY_WEBSITES;

const UA = {
  'User-Agent': 'TRACE24/1.3 (public integrity research; +https://trace24-app.vercel.app)',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'th,en;q=0.8',
};

const PATH_HINTS = [
  '',
  '/index.php',
  '/ทำเนียบผู้บริหาร',
  '/ทำเนียบผู้บริหาร.html',
  '/โครงสร้างองค์กร',
  '/โครงสร้าง',
  '/คณะผู้บริหาร',
  '/ผู้บริหาร',
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
  /ทำเนียบ|ผู้บริหาร|คณะผู้บริหาร|โครงสร้างองค์กร|นายกเทศมนตรี|ปลัดเทศบาล|executive|โครงสร้าง/i;

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

function discoverExecutiveLinks(html: string, pageUrl: string): string[] {
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
  return found.slice(0, 8);
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

function heuristicExtract(text: string, sourceUrl: string): AgencyExecutive[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: AgencyExecutive[] = [];
  const titleRe =
    /^(นายกเทศมนตรี(?:ตำบล|เมือง|นคร)?[\u0E00-\u0E7F\s]{0,24}|รองนายกเทศมนตรี|เลขานุการนายกเทศมนตรี|ที่ปรึกษานายกเทศมนตรี|ปลัดเทศบาล|รองปลัดเทศบาล|หัวหน้าสำนัก[\u0E00-\u0E7F\s]{0,20}|ผู้อำนวยการ[\u0E00-\u0E7F\s]{0,24}|หัวหน้าฝ่าย[\u0E00-\u0E7F\s]{0,20}|เจ้าหน้าที่พัสดุ|ประธานสภาเทศบาล|รองประธานสภาเทศบาล)$/;
  const nameRe = /^((?:นาย|นางสาว|นาง|ว่าที่)\s*[\u0E00-\u0E7F.]+\s+[\u0E00-\u0E7F.]+)$/;

  const push = (name: string, title: string) => {
    const n = name.replace(/\s+/g, ' ').trim();
    const t = title.replace(/\s+/g, ' ').trim();
    if (n.length < 5 || t.length < 4) return;
    if (/นายกเทศมนตรี$/.test(n) || nameRe.test(t) || titleRe.test(n)) return;
    if (out.some((e) => e.name === n && e.title === t)) return;
    out.push({ name: n, title: t, sourceUrl });
  };

  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    // Prefer adjacent lines only (common CMS: name then title)
    if (nameRe.test(a) && titleRe.test(b)) push(a, b);
    else if (titleRe.test(a) && nameRe.test(b)) push(b, a);
    if (out.length >= 25) break;
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

  const clipped = text.slice(0, 14000);
  const result = await chatCompletion(
    [
      {
        role: 'system',
        content: `You extract Thai municipal executives from website text for TRACE24.
Rules:
- ONLY use names and titles explicitly present in the text. Never invent or guess.
- If unsure, omit the person.
- Prefer political executives and senior officials (นายกฯ รองฯ ปลัด หัวหน้าส่วน เจ้าหน้าที่พัสดุ).
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
    { "name": "นาย...", "title": "นายกเทศมนตรี", "sourceUrl": "https://..." }
  ],
  "notes": "สั้น ๆ ว่าพบจากส่วนไหน หรือว่าไม่พบ"
}
ถ้าไม่พบรายชื่อในข้อความ ให้ executives เป็น []`,
      },
    ],
    { temperature: 0.05, maxTokens: 1600, json: true }
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
    if (!name || name.length < 4 || !title) continue;
    // Must appear in source text (loose check)
    const nameCore = name.replace(/^(นาย|นางสาว|นาง|ว่าที่\s*ร\.ต\.|ดร\.)\s*/i, '').trim();
    if (nameCore.length >= 3 && !text.includes(nameCore.split(/\s+/)[0] || nameCore)) {
      // still allow if full name present
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
  if (!seeds.length) {
    return {
      ok: false,
      executives: [],
      sources: [],
      model: null,
      note: 'ยังไม่มี URL เว็บหน่วยงาน — ใส่ลิงก์ทำเนียบผู้บริหารแล้วลองใหม่',
      error: 'missing_url',
    };
  }

  const candidateUrls = new Set<string>();
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
  const usedUrls: string[] = [];
  const discovered: string[] = [];

  // First pass: homepage + path hints (cap) — include /index.php and personnel CMS paths
  const firstBatch = [...candidateUrls].slice(0, 10);
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
    discovered.push(...discoverExecutiveLinks(got.html, url));
    const text = htmlToText(got.html);
    if (text.length > 80) {
      textParts.push(`### ${url}\n${text.slice(0, 8000)}`);
      usedUrls.push(url);
    }
  }

  // Second pass: discovered executive-ish links
  for (const url of discovered.slice(0, 4)) {
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
    const text = htmlToText(got.html);
    if (text.length > 80) {
      textParts.push(`### ${url}\n${text.slice(0, 8000)}`);
      usedUrls.push(url);
    }
  }

  const combined = textParts.join('\n\n').slice(0, 20000);
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

  const llm = await llmExtract(opts.agencyName, combined, usedUrls);
  let executives = llm.executives;

  if (!executives.length) {
    for (const url of usedUrls) {
      const chunk = textParts.find((t) => t.includes(url)) || combined;
      executives.push(...heuristicExtract(chunk, url));
    }
    // dedupe
    const seen = new Set<string>();
    executives = executives.filter((e) => {
      const k = `${e.name}|${e.title}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  return {
    ok: executives.length > 0,
    executives: executives.slice(0, 40),
    sources,
    model: llm.model,
    note: executives.length
      ? `สกัดได้ ${executives.length} รายการจากเว็บ — ตรวจชื่อก่อนบันทึก (AI ไม่ยืนยันตัวตน)`
      : llm.error
        ? `ไม่พบรายชื่อชัดเจน (${llm.error}) — ใส่ URL หน้าทำเนียบโดยตรงแล้วลองใหม่`
        : 'ไม่พบรายชื่อผู้บริหารในข้อความที่ดึงได้ — ใส่ URL หน้าทำเนียบโดยตรงแล้วลองใหม่',
    error: executives.length ? undefined : 'no_executives',
  };
}
