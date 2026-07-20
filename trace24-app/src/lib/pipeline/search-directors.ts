/**
 * AI-assisted director/shareholder search for one winning contractor.
 * Sources: Creden · DataForThai · DBD warehouse · open-web search (DDG/Bing as Google-like index).
 * Never invent names — extract only from fetched public text.
 */
import 'server-only';

import { upsertCompany } from '@/lib/companies/store';
import { searchOpenWeb, type SearchHit } from './fetch-company-age';
import {
  PUBLIC_SOURCE_DISCLAIMER,
  credenCandidateUrls,
  credenProfileUrl,
  dataforthaiProfileUrl,
  dbdProfileUrl,
  extractDirectorsFromPaste,
  mergeCompanyDrafts,
} from './fetch-directors';
import type { CompanyPerson, RelatedCompanyRecord } from './related-party';
import { getOrEmptyRelatedPack, saveRelatedPartyPack } from './related-party-store';

const UA = {
  'User-Agent':
    'Mozilla/5.0 (compatible; TRACE24/1.3; +https://trace24-app.vercel.app; public integrity research)',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'th,en;q=0.8',
};

const TIN_RE = /^\d{13}$/;

export type SearchDirectorsResult = {
  ok: boolean;
  companyName: string;
  tin: string;
  directors: CompanyPerson[];
  address?: string;
  sources: {
    url: string;
    ok: boolean;
    status?: number;
    bytes?: number;
    error?: string;
    kind?: string;
  }[];
  searchHits: SearchHit[];
  model: string | null;
  note: string;
  error?: string;
  scrapeBlocked?: boolean;
  disclaimer: string;
  company?: RelatedCompanyRecord;
  persisted?: boolean;
};

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

async function fetchPage(url: string, timeoutMs = 16000): Promise<{
  ok: boolean;
  status: number;
  html: string;
  error?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const cookie =
      /creden\.co/i.test(url) &&
      (process.env.CREDEN_COOKIE?.trim() || process.env.CREDEN_SESSION?.trim());
    const res = await fetch(url, {
      headers: {
        ...UA,
        ...(cookie ? { Cookie: cookie } : {}),
      },
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

function looksBlocked(html: string, text: string): boolean {
  const blob = `${html.slice(0, 5000)}\n${text.slice(0, 3000)}`;
  if (/cloudflare|just a moment|captcha|access denied/i.test(blob)) return true;
  if (/ดูฟรี\.\.!?\s*เมื่อคุณเข้าสู่ระบบ|กรุณาเข้าสู่ระบบก่อนการใช้งาน|Sign in with Creden/i.test(blob)) {
    if (!/(นาย|นางสาว|นาง)\s+[\u0E00-\u0E7F]{2,}/.test(text)) return true;
  }
  return false;
}

function directorSearchQueries(name: string, tin: string): string[] {
  const n = name.replace(/\s+/g, ' ').trim();
  const q: string[] = [];
  if (TIN_RE.test(tin)) {
    q.push(`"${tin}" กรรมการ`);
    q.push(`site:dataforthai.com/company ${tin}`);
    q.push(`site:data.creden.co ${tin}`);
  }
  if (n.length >= 4) {
    q.push(`"${n}" กรรมการ ผู้ถือหุ้น`);
    q.push(`"${n}" site:dataforthai.com`);
  }
  return q.slice(0, 3);
}

function preferHostScore(url: string): number {
  try {
    const h = new URL(url).hostname;
    if (/dataforthai\.com/i.test(h)) return 100;
    if (/creden\.co/i.test(h)) return 90;
    if (/dbd\.go\.th/i.test(h)) return 80;
    if (/gprocurement|egp/i.test(h)) return 40;
    return 20;
  } catch {
    return 0;
  }
}

/** Search public sources + AI extract directors for one company. */
export async function searchDirectorsForCompany(opts: {
  companyName: string;
  tin?: string;
  agencyId?: string;
  persist?: boolean;
}): Promise<SearchDirectorsResult> {
  const companyName = String(opts.companyName || '').replace(/\s+/g, ' ').trim();
  const tin = String(opts.tin || '').replace(/\D/g, '');
  const sources: SearchDirectorsResult['sources'] = [];
  const chunks: { url: string; kind: string; text: string }[] = [];
  let scrapeBlocked = false;
  const searchHits: SearchHit[] = [];

  if (!companyName && !TIN_RE.test(tin)) {
    return {
      ok: false,
      companyName: companyName || '—',
      tin,
      directors: [],
      sources: [],
      searchHits: [],
      model: null,
      note: 'ต้องมีชื่อบริษัทหรือเลขนิติบุคคล 13 หลัก',
      error: 'missing_identity',
      disclaimer: PUBLIC_SOURCE_DISCLAIMER,
    };
  }

  // 1) Direct registry profile URLs
  const profileUrls: { url: string; kind: string }[] = [];
  if (TIN_RE.test(tin)) {
    profileUrls.push({ url: dataforthaiProfileUrl(tin), kind: 'dataforthai' });
    for (const url of credenCandidateUrls(tin)) {
      profileUrls.push({ url, kind: 'creden' });
    }
    profileUrls.push({ url: dbdProfileUrl(tin), kind: 'dbd' });
    profileUrls.push({
      url: `https://datawarehouse.dbd.go.th/company/companyProfile/${tin}`,
      kind: 'dbd',
    });
  }

  for (const p of profileUrls) {
    const got = await fetchPage(p.url);
    sources.push({
      url: p.url,
      ok: got.ok,
      status: got.status,
      bytes: got.html.length,
      error: got.error,
      kind: p.kind,
    });
    if (!got.ok || !got.html) continue;
    const text = htmlToText(got.html);
    if (looksBlocked(got.html, text)) {
      scrapeBlocked = true;
      continue;
    }
    if (text.length < 80) continue;
    if (!/(กรรมการ|ผู้ถือหุ้น|ผู้มีอำนาจ|หุ้นส่วน)/.test(text) && p.kind !== 'dataforthai') {
      continue;
    }
    chunks.push({ url: p.url, kind: p.kind, text: text.slice(0, 10000) });
  }

  // 2) Open-web search (DDG/Bing — public index; Google HTML often blocked from cloud)
  for (const q of directorSearchQueries(companyName, tin)) {
    const { hits, sources: searchSources } = await searchOpenWeb(q);
    sources.push(...searchSources);
    for (const h of hits) {
      if (!searchHits.some((x) => x.url === h.url)) searchHits.push(h);
    }
  }

  const rankedHits = [...searchHits].sort(
    (a, b) => preferHostScore(b.url) - preferHostScore(a.url)
  );
  for (const h of rankedHits.slice(0, 5)) {
    if (chunks.some((c) => c.url === h.url)) continue;
    const got = await fetchPage(h.url);
    sources.push({
      url: h.url,
      ok: got.ok,
      status: got.status,
      bytes: got.html.length,
      error: got.error,
      kind: 'web',
    });
    if (!got.ok || !got.html) continue;
    const text = htmlToText(got.html);
    if (looksBlocked(got.html, text)) {
      scrapeBlocked = true;
      continue;
    }
    if (text.length < 120) continue;
    // Keep pages that mention the company/TIN or director cues
    const mentions =
      (TIN_RE.test(tin) && text.includes(tin)) ||
      (companyName.length >= 6 && text.includes(companyName.slice(0, Math.min(12, companyName.length)))) ||
      /(กรรมการ|ผู้ถือหุ้น)/.test(text);
    if (!mentions) continue;
    chunks.push({
      url: h.url,
      kind: 'web',
      text: `${h.title}\n${h.snippet}\n${text}`.slice(0, 10000),
    });
  }

  if (!chunks.length) {
    const fallbackLinks = [
      TIN_RE.test(tin) ? dataforthaiProfileUrl(tin) : '',
      TIN_RE.test(tin) ? credenProfileUrl(tin) : '',
      TIN_RE.test(tin) ? dbdProfileUrl(tin) : '',
      ...searchHits.slice(0, 3).map((h) => h.url),
    ].filter(Boolean);

    return {
      ok: false,
      companyName: companyName || tin,
      tin,
      directors: [],
      sources,
      searchHits: rankedHits.slice(0, 8),
      model: null,
      note: scrapeBlocked
        ? `แหล่งหลักล็อก/บล็อกการดึงอัตโนมัติ — เปิดลิงก์แล้ววางข้อความกรรมการ: ${fallbackLinks.slice(0, 4).join(' · ')}`
        : `ยังไม่พบข้อความกรรมการจากเว็บ — ลองเปิด: ${fallbackLinks.slice(0, 4).join(' · ') || 'DataForThai / Creden / DBD'}`,
      error: 'no_public_text',
      scrapeBlocked,
      disclaimer: PUBLIC_SOURCE_DISCLAIMER,
    };
  }

  // 3) AI extract from combined public text
  const combined = chunks
    .map((c) => `### แหล่ง ${c.kind}: ${c.url}\n${c.text}`)
    .join('\n\n')
    .slice(0, 28000);

  const extracted = await extractDirectorsFromPaste({
    companyName: companyName || tin,
    tin: TIN_RE.test(tin) ? tin : undefined,
    text: combined,
    sourceUrl: chunks[0]?.url,
  });

  const directors = extracted.companies[0]?.directors || [];
  const address = extracted.companies[0]?.address;
  const company: RelatedCompanyRecord = {
    tin: TIN_RE.test(tin) ? tin : undefined,
    name: companyName || tin,
    address,
    directors,
    sourceUrl: chunks[0]?.url || (TIN_RE.test(tin) ? dataforthaiProfileUrl(tin) : undefined),
    fetchedAt: new Date().toISOString(),
  };

  let persisted = false;
  if (opts.persist && directors.length > 0) {
    if (TIN_RE.test(tin)) {
      upsertCompany({
        tin,
        name: companyName || tin,
        address,
        directors,
        sources: chunks.slice(0, 4).map((c) => ({
          kind:
            c.kind === 'creden'
              ? 'creden'
              : c.kind === 'dataforthai'
                ? 'dataforthai'
                : c.kind === 'dbd'
                  ? 'dbd-open'
                  : 'related-pack',
          url: c.url,
          fetchedAt: new Date().toISOString(),
          note: 'AI search-directors from public sources',
        })),
        confidence: 'open_dbd',
      });
    }
    if (opts.agencyId) {
      const pack = getOrEmptyRelatedPack(opts.agencyId);
      const companies = mergeCompanyDrafts(pack.companies, [company]);
      saveRelatedPartyPack(opts.agencyId, {
        ...pack,
        agencyId: opts.agencyId,
        companies,
        note: `ค้นหากรรมการด้วย AI · ${companyName || tin}`,
      });
      persisted = true;
    } else if (TIN_RE.test(tin)) {
      persisted = true;
    }
  }

  return {
    ok: directors.length > 0,
    companyName: companyName || tin,
    tin,
    directors,
    address,
    sources,
    searchHits: rankedHits.slice(0, 8),
    model: extracted.model,
    note: directors.length
      ? `พบ ${directors.length} รายชื่อจาก ${chunks.length} แหล่งสาธารณะ (Creden · DataForThai · DBD · ค้นเว็บ) — รอยืนยัน`
      : 'ดึงข้อความได้แต่ยังสกัดชื่อกรรมการไม่ได้ — ลองเปิดลิงก์แล้ววางข้อความที่แท็บความเชื่อมโยง',
    error: directors.length ? undefined : 'no_people',
    scrapeBlocked,
    disclaimer: PUBLIC_SOURCE_DISCLAIMER,
    company,
    persisted,
  };
}
