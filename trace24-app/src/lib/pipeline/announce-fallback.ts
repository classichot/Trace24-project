/**
 * Direct e-GP / municipal announcement extract — official fallback when Open D is down.
 */
import { toArabicDigits } from './normalize';

export type AnnounceParseResult = {
  winner: string | null;
  price: number | null;
  budget: number | null;
};

export async function fetchAnnouncePlain(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TRACE24/1.0 (public-sector research demo)' },
    });
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    let text = '';
    try {
      text = new TextDecoder('windows-874').decode(buf);
    } catch {
      text = buf.toString('utf8');
    }
    if (!/ประกาศ|ผู้ชนะ|ยกเลิก|เชิญชวน/.test(text) && /ประกาศ|ผู้ชนะ/.test(buf.toString('utf8'))) {
      text = buf.toString('utf8');
    }
    return text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } finally {
    clearTimeout(timer);
  }
}

export function parseWinnerFromAnnounceText(plain: string): AnnounceParseResult {
  if (!plain || /ค้นหาไฟล์เอกสารไม่พบ/.test(plain)) {
    return { winner: null, price: null, budget: null };
  }
  const winnerRaw =
    plain.match(/ผู้ได้รับการคัดเลือก\s*ได้แก่\s*(.+?)\s*โดยเสนอราคา/)?.[1] ||
    plain.match(/ได้แก่\s*((?:นาย|นางสาว|นาง|หจก\.|ห้างหุ้นส่วนจำกัด|บริษัท)[^โดย]{1,100}?)\s*โดยเสนอราคา/)?.[1] ||
    null;
  const winner = winnerRaw
    ? winnerRaw
        .replace(/\s+/g, ' ')
        .replace(/\([^)]*(ให้บริการ|ขาย|ส่งออก|ผู้ผลิต)[^)]*\)/g, '')
        .trim()
    : null;

  const moneyThai = plain.match(/เป็นเงินทั้งสิ้น\s*([0-9๐-๙,.]+)\s*บาท/)?.[1] || null;
  const price = moneyThai ? Number(toArabicDigits(moneyThai).replace(/,/g, '')) : null;

  const budgetThai =
    plain.match(/วงเงินงบประมาณ\s*([0-9๐-๙,.]+)\s*บาท/)?.[1] ||
    plain.match(/ราคากลาง\s*([0-9๐-๙,.]+)\s*บาท/)?.[1] ||
    null;
  const budget = budgetThai ? Number(toArabicDigits(budgetThai).replace(/,/g, '')) : null;

  return {
    winner: winner || null,
    price: Number.isFinite(price as number) ? (price as number) : null,
    budget: Number.isFinite(budget as number) ? (budget as number) : null,
  };
}

export async function extractFromAnnounceUrl(url: string) {
  const plain = await fetchAnnouncePlain(url);
  const parsed = parseWinnerFromAnnounceText(plain);
  return {
    url,
    source: 'announce-html-fallback',
    plainPreview: plain.slice(0, 240),
    ...parsed,
  };
}

/** Collect e-GP ShowHTMLFile URLs from a cached agency report project */
export function collectProjectAnnounceUrls(project: {
  code?: string;
  timeline?: [string, string, string][];
  _sourceUrl?: string | null;
}): string[] {
  const hrefs: string[] = [];
  for (const row of project.timeline || []) {
    const href = row[2];
    if (
      href &&
      /gprocurement\.go\.th|ShowHTMLFile/i.test(href) &&
      /ผู้ชนะ|คัดเลือก/.test(row[1] || '') &&
      !/ยกเลิก/.test(row[1] || '')
    ) {
      hrefs.push(href);
    }
  }
  if (project._sourceUrl && /gprocurement\.go\.th|ShowHTMLFile/i.test(project._sourceUrl)) {
    hrefs.push(project._sourceUrl);
  }
  if (!hrefs.length && /^\d{8,}$/.test(String(project.code || ''))) {
    const params = new URLSearchParams({
      servlet: 'gojsp',
      proc_id: 'ShowHTMLFile',
      processFlows: 'Procure',
      projectId: String(project.code),
      templateType: 'W2',
      temp_Announ: 'A',
      temp_itemNo: '0',
      seqNo: '1',
    });
    hrefs.push(
      `https://process.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?${params}`
    );
  }
  return [...new Set(hrefs)];
}
