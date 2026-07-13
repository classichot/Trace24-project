import zlib from 'zlib';
import { toArabicDigits } from './normalize';

export type ExtractedDocument = {
  sourceUrl: string;
  contentType: string;
  method: 'html' | 'pdf-text' | 'pdf-stream' | 'ocr-stub' | 'plain';
  title: string | null;
  text: string;
  tables: string[][];
  metadata: Record<string, string>;
  confidence: number;
};

/** Strip tags / scripts from HTML and keep readable Thai/Latin text */
export function extractFromHtml(html: string, sourceUrl = ''): ExtractedDocument {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const tables: string[][] = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(html))) {
    const rows = [...tm[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((row) =>
      [...row[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
        c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      )
    );
    if (rows.length) tables.push(...rows.filter((r) => r.some(Boolean)));
  }

  return {
    sourceUrl,
    contentType: 'text/html',
    method: 'html',
    title,
    text: toArabicDigits(text),
    tables,
    metadata: { chars: String(text.length), tables: String(tables.length) },
    confidence: text.length > 40 ? 0.9 : 0.4,
  };
}

function decodePdfLiteral(raw: string) {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function decodePdfHex(hex: string) {
  const clean = hex.replace(/\s+/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  // UTF-16BE BOM
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return out;
  }
  try {
    return new TextDecoder('utf-8').decode(Buffer.from(bytes));
  } catch {
    return Buffer.from(bytes).toString('latin1');
  }
}

function inflatePdfStreams(buf: Buffer): string {
  const latin = buf.toString('latin1');
  const chunks: string[] = [];
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m;
  while ((m = re.exec(latin))) {
    let payload = m[1];
    if (payload.startsWith('\r\n')) payload = payload.slice(2);
    else if (payload.startsWith('\n')) payload = payload.slice(1);
    const raw = Buffer.from(payload, 'latin1');
    try {
      const inflated = zlib.inflateSync(raw);
      chunks.push(inflated.toString('utf8'));
      chunks.push(inflated.toString('latin1'));
    } catch {
      try {
        const inflated = zlib.unzipSync(raw);
        chunks.push(inflated.toString('utf8'));
      } catch {
        // not flate
      }
    }
  }
  return chunks.join('\n');
}

/** Extract text from PDF bytes (literal strings + inflated streams). No external OCR engine. */
export function extractFromPdf(buf: Buffer, sourceUrl = ''): ExtractedDocument {
  const latin = buf.toString('latin1');
  const inflated = inflatePdfStreams(buf);
  const corpus = `${latin}\n${inflated}`;

  const literals = [...corpus.matchAll(/\((?:\\.|[^\\)]){2,500}\)/g)]
    .map((m) => decodePdfLiteral(m[0].slice(1, -1)))
    .filter((s) => /[\u0E00-\u0E7Fa-zA-Z0-9]/.test(s));

  const hexes = [...corpus.matchAll(/<([0-9A-Fa-f\s]{8,})>/g)]
    .map((m) => decodePdfHex(m[1]))
    .filter((s) => /[\u0E00-\u0E7Fa-zA-Z0-9]/.test(s) && s.length > 2);

  const text = toArabicDigits([...literals, ...hexes].join(' ').replace(/\s+/g, ' ').trim());
  const method = inflated.length > 50 ? 'pdf-stream' : 'pdf-text';
  return {
    sourceUrl,
    contentType: 'application/pdf',
    method,
    title: null,
    text,
    tables: [],
    metadata: {
      bytes: String(buf.length),
      literals: String(literals.length),
      hexStrings: String(hexes.length),
    },
    confidence: text.length > 80 ? 0.75 : text.length > 20 ? 0.45 : 0.15,
  };
}

/**
 * OCR stub for scanned images — records layout intent and returns empty text with low confidence.
 * Hook point for Tesseract/Cloud Vision later.
 */
export function extractFromImageStub(
  meta: { width?: number; height?: number; sourceUrl?: string; note?: string } = {}
): ExtractedDocument {
  return {
    sourceUrl: meta.sourceUrl || '',
    contentType: 'image/*',
    method: 'ocr-stub',
    title: null,
    text: '',
    tables: [],
    metadata: {
      layout: 'full-page',
      ocrEngine: 'pending-tesseract',
      note: meta.note || 'Image OCR not installed — pipeline slot ready',
      width: String(meta.width || ''),
      height: String(meta.height || ''),
    },
    confidence: 0,
  };
}

export async function extractFromUrl(url: string): Promise<ExtractedDocument> {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'TRACE24/1.0 (document extraction)' },
  });
  if (!r.ok) throw new Error(`extract ${url} -> ${r.status}`);
  const ctype = r.headers.get('content-type') || '';
  const buf = Buffer.from(await r.arrayBuffer());

  if (/pdf/i.test(ctype) || url.toLowerCase().endsWith('.pdf')) {
    return extractFromPdf(buf, url);
  }
  if (/image\//i.test(ctype)) {
    return extractFromImageStub({ sourceUrl: url });
  }

  // e-GP announce pages often TIS-620 / windows-874
  let html = '';
  try {
    html = new TextDecoder('windows-874').decode(buf);
    if (!/ประกาศ|ผู้ชนะ|html/i.test(html)) html = buf.toString('utf8');
  } catch {
    html = buf.toString('utf8');
  }
  return extractFromHtml(html, url);
}

/** Chunk long document text for vector indexing */
export function chunkText(text: string, size = 420, overlap = 60): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += size - overlap) {
    chunks.push(clean.slice(i, i + size));
    if (i + size >= clean.length) break;
  }
  return chunks;
}
