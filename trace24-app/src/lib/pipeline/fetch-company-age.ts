/**
 * Company age lookup — prefer DataForThai (วันจดทะเบียน) by TIN, then open-web/news + LLM.
 * Never invent dates. Draft only — human review before save.
 */
import 'server-only';

import { chatCompletion, parseJsonLoose } from '@/lib/llm/client';
import { getLlmConfig } from '@/lib/llm/config';
import { collectWinnerCandidates, mergeCompanyDrafts, type WinnerCandidate } from './fetch-directors';
import type {
  CompanyAgeConfidence,
  CompanyAgePrecision,
  RelatedCompanyRecord,
} from './related-party';
import type { PipelineReportLike } from './types';

const UA = {
  'User-Agent':
    'Mozilla/5.0 (compatible; TRACE24/1.3; +https://trace24-app.vercel.app; public integrity research)',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'th,en;q=0.8',
};

const SKIP_HOST =
  /google\.(com|co\.th)|facebook\.com|instagram\.com|youtube\.com|twitter\.com|x\.com|tiktok\.com|linkedin\.com|cloudflare\.com|captcha/i;

export type SearchHit = { title: string; url: string; snippet: string };

export type FetchCompanyAgeResult = {
  ok: boolean;
  companies: RelatedCompanyRecord[];
  winners: WinnerCandidate[];
  sources: { url: string; ok: boolean; status?: number; bytes?: number; error?: string; kind?: string }[];
  model: string | null;
  note: string;
  error?: string;
};

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
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeUriLoose(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function normalizeResultUrl(raw: string): string | null {
  let u = decodeUriLoose(raw.trim());
  if (u.startsWith('//')) u = `https:${u}`;
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    const parsed = new URL(u);
    if (SKIP_HOST.test(parsed.hostname)) return null;
    if (/duckduckgo\.com|bing\.com|yahoo\.com/i.test(parsed.hostname)) return null;
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

async function fetchPage(
  url: string,
  timeoutMs = 14000
): Promise<{ ok: boolean; status: number; html: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

function parseDuckDuckGoHtml(html: string): SearchHit[] {
  const out: SearchHit[] = [];
  const blockRe =
    /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) && out.length < 12) {
    const href = m[1] || '';
    const uddg = href.match(/uddg=([^&]+)/);
    const url = normalizeResultUrl(uddg ? uddg[1] : href);
    if (!url) continue;
    const title = htmlToText(m[2] || '').slice(0, 160);
    const snippet = htmlToText(m[3] || '').slice(0, 280);
    if (out.some((x) => x.url === url)) continue;
    out.push({ title, url, snippet });
  }
  if (!out.length) {
    const uddgRe = /uddg=([^&"]+)/g;
    while ((m = uddgRe.exec(html)) && out.length < 10) {
      const url = normalizeResultUrl(m[1]);
      if (!url || out.some((x) => x.url === url)) continue;
      out.push({ title: hostOf(url), url, snippet: '' });
    }
  }
  return out;
}

function parseBingHtml(html: string): SearchHit[] {
  const out: SearchHit[] = [];
  const re =
    /<li class="b_algo"[\s\S]*?<h2>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 12) {
    const url = normalizeResultUrl(m[1] || '');
    if (!url) continue;
    const title = htmlToText(m[2] || '').slice(0, 160);
    const snippet = htmlToText(m[3] || '').slice(0, 280);
    if (out.some((x) => x.url === url)) continue;
    out.push({ title, url, snippet });
  }
  return out;
}

async function searchOpenWeb(query: string): Promise<{
  hits: SearchHit[];
  sources: FetchCompanyAgeResult['sources'];
}> {
  const sources: FetchCompanyAgeResult['sources'] = [];
  const hits: SearchHit[] = [];

  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const ddg = await fetchPage(ddgUrl, 16000);
  sources.push({
    url: ddgUrl,
    ok: ddg.ok,
    status: ddg.status,
    bytes: ddg.html.length,
    error: ddg.error,
    kind: 'search-ddg',
  });
  if (ddg.ok) {
    for (const h of parseDuckDuckGoHtml(ddg.html)) {
      if (!hits.some((x) => x.url === h.url)) hits.push(h);
    }
  }

  if (hits.length < 4) {
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=th-TH`;
    const bing = await fetchPage(bingUrl, 16000);
    sources.push({
      url: bingUrl,
      ok: bing.ok,
      status: bing.status,
      bytes: bing.html.length,
      error: bing.error,
      kind: 'search-bing',
    });
    if (bing.ok) {
      for (const h of parseBingHtml(bing.html)) {
        if (!hits.some((x) => x.url === h.url)) hits.push(h);
      }
    }
  }

  return { hits: hits.slice(0, 8), sources };
}

function buildQueries(name: string, tin: string): string[] {
  const n = name.replace(/\s+/g, ' ').trim();
  const q: string[] = [];
  if (tin) {
    q.push(`site:dataforthai.com/company ${tin}`);
    q.push(`"${tin}" จดทะเบียน`);
  }
  q.push(`"${n}" site:dataforthai.com`);
  q.push(`"${n}" จดทะเบียน บริษัท`);
  return q.slice(0, 2);
}

const TH_MONTHS: Record<string, number> = {
  มกราคม: 1,
  กุมภาพันธ์: 2,
  มีนาคม: 3,
  เมษายน: 4,
  พฤษภาคม: 5,
  มิถุนายน: 6,
  กรกฎาคม: 7,
  สิงหาคม: 8,
  กันยายน: 9,
  ตุลาคม: 10,
  พฤศจิกายน: 11,
  ธันวาคม: 12,
  'ม.ค.': 1,
  'ก.พ.': 2,
  'มี.ค.': 3,
  'เม.ย.': 4,
  'พ.ค.': 5,
  'มิ.ย.': 6,
  'ก.ค.': 7,
  'ส.ค.': 8,
  'ก.ย.': 9,
  'ต.ค.': 10,
  'พ.ย.': 11,
  'ธ.ค.': 12,
};

function dataforthaiUrl(tin: string): string {
  return `https://www.dataforthai.com/company/${tin.replace(/\D/g, '')}/`;
}

/** Parse "จดทะเบียน | 4 มิถุนายน 2567" from DataForThai (or similar) text. */
export function parseThaiRegistrationDate(text: string): {
  registeredAt: string;
  precision: CompanyAgePrecision;
  quote: string;
} | null {
  const compact = text.replace(/\s+/g, ' ');
  const re =
    /(?:วันที่\s*)?จดทะเบียน\s*[:|]?\s*(\d{1,2})\s*(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|ม\.?\s*ค\.?|ก\.?\s*พ\.?|มี\.?\s*ค\.?|เม\.?\s*ย\.?|พ\.?\s*ค\.?|มิ\.?\s*ย\.?|ก\.?\s*ค\.?|ส\.?\s*ค\.?|ก\.?\s*ย\.?|ต\.?\s*ค\.?|พ\.?\s*ย\.?|ธ\.?\s*ค\.?)\s*(25\d{2}|20\d{2})/i;
  const m = compact.match(re);
  if (!m) return null;
  const day = Number(m[1]);
  const monthRaw = m[2].replace(/\s+/g, '');
  let month = TH_MONTHS[m[2]] || TH_MONTHS[monthRaw];
  if (!month) {
    const abbr: [RegExp, number][] = [
      [/^ม\.?ค/i, 1],
      [/^ก\.?พ/i, 2],
      [/^มี\.?ค/i, 3],
      [/^เม\.?ย/i, 4],
      [/^พ\.?ค/i, 5],
      [/^มิ\.?ย/i, 6],
      [/^ก\.?ค/i, 7],
      [/^ส\.?ค/i, 8],
      [/^ก\.?ย/i, 9],
      [/^ต\.?ค/i, 10],
      [/^พ\.?ย/i, 11],
      [/^ธ\.?ค/i, 12],
    ];
    for (const [rx, n] of abbr) {
      if (rx.test(monthRaw)) {
        month = n;
        break;
      }
    }
  }
  let year = Number(m[3]);
  if (!day || !month || !year || day > 31) return null;
  if (year >= 2400) year -= 543;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    registeredAt: iso,
    precision: 'day',
    quote: `${m[1]} ${m[2]} ${m[3]}`.replace(/\s+/g, ' ').trim(),
  };
}

/** Parse ทุนจดทะเบียน from DataForThai text → baht number. */
export function parseRegisteredCapital(text: string): number | null {
  const m = text
    .replace(/\s+/g, ' ')
    .match(/ทุนจดทะเบียน\s*[:|]?\s*([\d,]+(?:\.\d+)?)\s*บาท/i);
  if (!m) return null;
  const n = Number(String(m[1]).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parse ที่ตั้ง/แผนที่ from DataForThai company page text. */
export function extractAddressHint(text: string): string | undefined {
  const compact = text.replace(/\s+/g, ' ');
  const patterns = [
    /ที่ตั้ง\s*แผนที่\s*[:|]?\s*([^|]{16,200}?)(?:\s*ค้นหาบริษัท|\s*ค้นหาเบอร์|\s*ดูตำแหน่ง|$)/i,
    /แผนที่\s*[:|]?\s*([^|]{16,200}?)(?:\s*ค้นหาบริษัท|\s*ค้นหาเบอร์|\s*ดูตำแหน่ง|$)/i,
    /ที่ตั้ง\s*[:|]?\s*([^|]{16,200}?)(?:\s*ค้นหาบริษัท|\s*ค้นหาเบอร์|\s*ทุนจด|$)/i,
  ];
  for (const re of patterns) {
    const m = compact.match(re);
    const addr = m?.[1]?.replace(/\s+/g, ' ').trim();
    if (!addr || addr.length < 12) continue;
    if (/^ยังดำเนิน|^สถานะ|^ทุนจด|^ทะเบียน/i.test(addr)) continue;
    return addr;
  }
  return undefined;
}

async function tryParseDataForThaiPage(
  url: string,
  tin: string,
  sources: FetchCompanyAgeResult['sources']
): Promise<{
  extract: AgeExtract | null;
  address?: string;
  registeredCapital?: number | null;
} | null> {
  const page = await fetchPage(url);
  sources.push({
    url,
    ok: page.ok,
    status: page.status,
    bytes: page.html.length,
    error: page.error,
    kind: 'dataforthai',
  });
  if (!page.ok || !page.html) return null;
  const text = htmlToText(page.html);
  if (tin && !text.includes(tin)) return null;
  if (!/จดทะเบียน|ที่ตั้ง|แผนที่|ทุนจดทะเบียน/i.test(text)) return null;
  const parsed = parseThaiRegistrationDate(text);
  const address = extractAddressHint(text);
  const registeredCapital = parseRegisteredCapital(text);
  if (!parsed && !address && !registeredCapital) return null;
  return {
    extract: parsed
      ? {
          registeredAt: parsed.registeredAt,
          precision: parsed.precision,
          confidence: 'high',
          quote: `จดทะเบียน ${parsed.quote}`,
          sourceUrl: url,
          note: 'จาก DataForThai (อ้างอิงข้อมูลเปิดภาครัฐ) — รอยืนยัน',
          kind: 'registration',
        }
      : null,
    address,
    registeredCapital,
  };
}

/** Primary path: DataForThai company page by TIN (same result Google usually surfaces). */
async function fetchFromDataForThai(
  w: WinnerCandidate
): Promise<{
  extract: AgeExtract | null;
  address?: string;
  registeredCapital?: number | null;
  sources: FetchCompanyAgeResult['sources'];
}> {
  const sources: FetchCompanyAgeResult['sources'] = [];
  const tin = (w.tin || '').replace(/\D/g, '');

  if (/^\d{13}$/.test(tin)) {
    const direct = await tryParseDataForThaiPage(dataforthaiUrl(tin), tin, sources);
    if (direct?.extract || direct?.address || direct?.registeredCapital) {
      return {
        extract: direct.extract,
        address: direct.address,
        registeredCapital: direct.registeredCapital,
        sources,
      };
    }
  }

  const q = tin
    ? `site:dataforthai.com/company ${tin}`
    : `"${w.name.replace(/\s+/g, ' ').trim()}" site:dataforthai.com/company`;
  const searched = await searchOpenWeb(q);
  sources.push(...searched.sources);
  for (const h of searched.hits) {
    if (!/dataforthai\.com\/company\//i.test(h.url)) continue;
    const url = h.url.replace(/\?.*$/, '');
    const hit = await tryParseDataForThaiPage(url, tin, sources);
    if (hit?.extract || hit?.address || hit?.registeredCapital) {
      return {
        extract: hit.extract,
        address: hit.address,
        registeredCapital: hit.registeredCapital,
        sources,
      };
    }
  }

  return { extract: null, sources };
}

type AgeExtract = {
  registeredAt: string | null;
  precision: CompanyAgePrecision;
  confidence: CompanyAgeConfidence;
  quote: string | null;
  sourceUrl: string | null;
  note: string | null;
  kind: 'registration' | 'founding' | 'unknown';
};

async function llmExtractAge(
  companyName: string,
  tin: string,
  corpus: string,
  candidateUrls: string[]
): Promise<{ extract: AgeExtract | null; model: string | null; error?: string }> {
  const cfg = getLlmConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return { extract: null, model: null, error: 'LLM not configured' };
  }

  const result = await chatCompletion(
    [
      {
        role: 'system',
        content: `Extract Thai company registration or founding date for TRACE24 integrity research.
Rules:
- ONLY use dates explicitly present in the provided text. Never invent or guess.
- Prefer official registration date (วันที่จดทะเบียน) over vague "founded".
- If only a year is stated, precision=year.
- If the text is about a different company, return registeredAt=null.
- Return JSON only.`,
      },
      {
        role: 'user',
        content: `บริษัทเป้าหมาย: ${companyName}
เลขนิติบุคคล: ${tin || '—'}
URL ที่ดึงมา: ${candidateUrls.join(' · ') || '—'}

ข้อความรวมจากผลการค้นหา/หน้าเว็บ/ข่าว:
---
${corpus.slice(0, 14000)}
---

ตอบ JSON:
{
  "registeredAt": "YYYY-MM-DD หรือ YYYY หรือ พ.ศ. 25xx หรือ null",
  "precision": "day|month|year|unknown",
  "confidence": "high|medium|low",
  "kind": "registration|founding|unknown",
  "quote": "ประโยคสั้น ๆ จากข้อความที่มีวันที่ (ต้องปรากฏในข้อความ)",
  "sourceUrl": "URL ที่น่าจะเป็นแหล่งของ quote หรือ null",
  "note": "สั้น ๆ หรือ null"
}`,
      },
    ],
    { temperature: 0.05, maxTokens: 700, json: true }
  );

  if (!result.ok) return { extract: null, model: null, error: result.error };

  const parsed = parseJsonLoose<{
    registeredAt?: string | null;
    precision?: string;
    confidence?: string;
    kind?: string;
    quote?: string | null;
    sourceUrl?: string | null;
    note?: string | null;
  }>(result.content);

  const rawDate = parsed?.registeredAt != null ? String(parsed.registeredAt).trim() : '';
  if (!rawDate || rawDate === 'null' || rawDate === '—') {
    return {
      extract: {
        registeredAt: null,
        precision: 'unknown',
        confidence: 'low',
        quote: null,
        sourceUrl: null,
        note: parsed?.note ? String(parsed.note) : 'ไม่พบวันที่ในข้อความ',
        kind: 'unknown',
      },
      model: result.model,
    };
  }

  // Quote must appear in corpus (loose) when provided
  const quote = parsed?.quote ? String(parsed.quote).trim() : '';
  if (quote.length >= 8) {
    const qCore = quote.slice(0, 24).replace(/\s+/g, '');
    const corpusCompact = corpus.replace(/\s+/g, '');
    if (qCore && !corpusCompact.includes(qCore) && !corpus.includes(quote.slice(0, 40))) {
      return {
        extract: {
          registeredAt: null,
          precision: 'unknown',
          confidence: 'low',
          quote: null,
          sourceUrl: null,
          note: 'ตัดทิ้ง — quote ไม่ตรงข้อความต้นทาง',
          kind: 'unknown',
        },
        model: result.model,
      };
    }
  }

  const precision = (['day', 'month', 'year', 'unknown'].includes(String(parsed?.precision))
    ? parsed!.precision
    : 'unknown') as CompanyAgePrecision;
  const confidence = (['high', 'medium', 'low'].includes(String(parsed?.confidence))
    ? parsed!.confidence
    : 'low') as CompanyAgeConfidence;
  const kindRaw = String(parsed?.kind || 'unknown');
  const kind =
    kindRaw === 'registration' || kindRaw === 'founding' ? kindRaw : ('unknown' as const);

  let sourceUrl = parsed?.sourceUrl ? normalizeResultUrl(String(parsed.sourceUrl)) : null;
  if (!sourceUrl && candidateUrls[0]) sourceUrl = candidateUrls[0];

  return {
    extract: {
      registeredAt: rawDate,
      precision,
      confidence,
      quote: quote || null,
      sourceUrl,
      note: parsed?.note ? String(parsed.note) : null,
      kind,
    },
    model: result.model,
  };
}

function toCompanyRecord(
  w: WinnerCandidate,
  extract: AgeExtract | null,
  extra?: { address?: string; sourceUrl?: string; registeredCapital?: number | null }
): RelatedCompanyRecord {
  const sourceUrl = extract?.sourceUrl || extra?.sourceUrl;
  const fromDft = /dataforthai\.com/i.test(sourceUrl || '');
  const base: RelatedCompanyRecord = {
    tin: w.tin || undefined,
    name: w.name,
    directors: [],
    address: extra?.address,
    registeredCapital: extra?.registeredCapital ?? undefined,
    sourceUrl: sourceUrl || undefined,
    fetchedAt: new Date().toISOString(),
  };
  if (!extract?.registeredAt) {
    if (extra?.address && fromDft) {
      base.registeredAtNote = 'ได้ที่อยู่จาก DataForThai — ยังไม่มีวันจดทะเบียนในหน้านี้';
    }
    return base;
  }
  return {
    ...base,
    registeredAt: extract.registeredAt,
    registeredAtPrecision: extract.precision,
    registeredAtSource: fromDft
      ? 'dataforthai'
      : extract.kind === 'registration'
        ? 'web'
        : 'news',
    registeredAtSourceUrl: extract.sourceUrl || undefined,
    registeredAtQuote: extract.quote || undefined,
    registeredAtConfidence: extract.confidence,
    registeredAtNote:
      extract.note ||
      (extract.kind === 'founding'
        ? 'ปี/วันก่อตั้งจากข่าวหรือเว็บ — ไม่ใช่วันจดทะเบียน DBD โดยตรง'
        : 'สกัดจากเว็บเปิด/ข่าว — รอยืนยัน'),
  };
}

/** DataForThai first (by TIN), then open-web/news + LLM. */
export async function fetchCompanyAgesForAgency(opts: {
  report: PipelineReportLike;
  limit?: number;
}): Promise<FetchCompanyAgeResult> {
  const winners = collectWinnerCandidates(opts.report, opts.limit ?? 6);
  if (!winners.length) {
    return {
      ok: false,
      companies: [],
      winners: [],
      sources: [],
      model: null,
      note: 'ยังไม่มีผู้ชนะ/เลขนิติบุคคลในรายงาน',
      error: 'no_winners',
    };
  }

  const cfg = getLlmConfig();
  const sources: FetchCompanyAgeResult['sources'] = [];
  const companies: RelatedCompanyRecord[] = [];
  let model: string | null = null;
  let found = 0;
  let fromDft = 0;
  let withAddress = 0;

  for (const w of winners) {
    // 1) DataForThai — primary (วันที่จดทะเบียน + ที่อยู่)
    const dft = await fetchFromDataForThai(w);
    sources.push(...dft.sources);
    if (dft.extract?.registeredAt || dft.address || dft.registeredCapital) {
      if (dft.extract?.registeredAt) {
        fromDft += 1;
        found += 1;
      }
      if (dft.address) withAddress += 1;
      companies.push(
        toCompanyRecord(w, dft.extract, {
          address: dft.address,
          registeredCapital: dft.registeredCapital,
          sourceUrl: dft.extract?.sourceUrl || (w.tin ? dataforthaiUrl(w.tin) : undefined),
        })
      );
      continue;
    }

    // 2) Fallback: broader web/news + LLM
    if (!cfg.enabled || !cfg.apiKey) {
      companies.push({
        ...toCompanyRecord(w, null),
        registeredAtNote:
          'ไม่พบบน DataForThai และยังไม่มี LLM สำหรับสกัดจากเว็บอื่น — ใส่ registeredAt เองหรือตั้ง OPENAI_API_KEY',
      });
      continue;
    }

    const queries = buildQueries(w.name, w.tin);
    const hits: SearchHit[] = [];
    for (const q of queries) {
      const searched = await searchOpenWeb(q);
      sources.push(...searched.sources);
      for (const h of searched.hits) {
        if (!hits.some((x) => x.url === h.url)) hits.push(h);
      }
      if (hits.length >= 6) break;
    }

    const pageChunks: string[] = [];
    const pageUrls: string[] = [];
    let resolvedFromHit = false;
    for (const h of hits.slice(0, 4)) {
      pageChunks.push(`[ผลค้นหา] ${h.title}\n${h.snippet}\nURL: ${h.url}`);
      const page = await fetchPage(h.url);
      sources.push({
        url: h.url,
        ok: page.ok,
        status: page.status,
        bytes: page.html.length,
        error: page.error,
        kind: 'page',
      });
      if (!page.ok || !page.html) continue;
      const text = htmlToText(page.html);
      if (text.length < 80) continue;
      if (/dataforthai\.com/i.test(h.url)) {
        const parsed = parseThaiRegistrationDate(text);
        if (parsed && (!w.tin || text.includes(w.tin))) {
          found += 1;
          fromDft += 1;
          companies.push(
            toCompanyRecord(
              w,
              {
                registeredAt: parsed.registeredAt,
                precision: parsed.precision,
                confidence: 'high',
                quote: `จดทะเบียน ${parsed.quote}`,
                sourceUrl: h.url,
                note: 'จาก DataForThai (อ้างอิงข้อมูลเปิดภาครัฐ) — รอยืนยัน',
                kind: 'registration',
              },
              { address: extractAddressHint(text) }
            )
          );
          resolvedFromHit = true;
          break;
        }
      }
      pageUrls.push(h.url);
      pageChunks.push(`[หน้าเว็บ ${h.url}]\n${text.slice(0, 4500)}`);
      if (pageChunks.join('\n').length > 12000) break;
    }

    if (resolvedFromHit) continue;

    if (!pageChunks.length) {
      companies.push(toCompanyRecord(w, null));
      continue;
    }

    const { extract, model: m, error } = await llmExtractAge(
      w.name,
      w.tin,
      pageChunks.join('\n\n'),
      pageUrls.length ? pageUrls : hits.map((h) => h.url)
    );
    if (m) model = m;
    if (error && !extract) {
      companies.push({
        ...toCompanyRecord(w, null),
        registeredAtNote: error,
      });
      continue;
    }
    const rec = toCompanyRecord(w, extract);
    if (rec.registeredAt) found += 1;
    companies.push(rec);
  }

  const noteParts = [
    fromDft ? `วันจดทะเบียน DataForThai ${fromDft}/${companies.length}` : null,
    withAddress ? `ที่อยู่ ${withAddress}/${companies.length}` : null,
    found > fromDft ? `วันจากเว็บ/ข่าวอื่น ${found - fromDft}` : null,
    withAddress >= 2 ? 'ถ้าที่อยู่เดียวกันชนะรวม >5 สัญญา จะขึ้น R19 หลังบันทึก' : null,
    'draft — ตรวจก่อนบันทึก',
  ].filter(Boolean);

  return {
    ok: companies.length > 0,
    companies,
    winners,
    sources,
    model,
    note:
      found || withAddress
        ? noteParts.join(' · ')
        : `ไม่พบวันจดทะเบียน/ที่อยู่จาก DataForThai สำหรับ ${companies.length} ผู้ชนะ — ตรวจเลขนิติบุคคล`,
    error: found || withAddress ? undefined : 'no_dates',
  };
}

export { mergeCompanyDrafts };
