/**
 * Demo access gate — shared password + optional email allowlist.
 * Cookie is HMAC-signed; Edge-compatible (Web Crypto only).
 *
 * Gate is ON when TRACE24_DEMO_PASSWORD and/or TRACE24_EMAIL_ALLOWLIST is set.
 * Local/dev with neither → open.
 */

export const GATE_COOKIE = 'trace24_gate';
const COOKIE_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

function gateSecret(): string {
  return (
    process.env.TRACE24_GATE_SECRET?.trim() ||
    process.env.TRACE24_DEMO_PASSWORD?.trim() ||
    // Allowlist-only demos still need a signing key
    process.env.TRACE24_EMAIL_ALLOWLIST?.trim() ||
    ''
  );
}

export function demoPasswordConfigured(): boolean {
  return Boolean(process.env.TRACE24_DEMO_PASSWORD?.trim());
}

export function emailAllowlist(): string[] {
  const raw = process.env.TRACE24_EMAIL_ALLOWLIST?.trim() || '';
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function demoGateEnabled(): boolean {
  return demoPasswordConfigured() || emailAllowlist().length > 0;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailAllowed(email: string): boolean {
  const list = emailAllowlist();
  if (!list.length) return true;
  return list.includes(normalizeEmail(email));
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(b64: string): string {
  const pad = b64 + '==='.slice((b64.length + 3) % 4);
  const bin = atob(pad.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type GatePayload = {
  email: string;
  exp: number;
};

export async function signGateCookie(email: string): Promise<string> {
  const secret = gateSecret();
  if (!secret) throw new Error('Gate secret not configured');
  const payload: GatePayload = {
    email: normalizeEmail(email) || 'demo',
    exp: Math.floor(Date.now() / 1000) + COOKIE_TTL_SEC,
  };
  const body = toBase64Url(JSON.stringify(payload));
  const sig = await hmacHex(secret, body);
  return `${body}.${sig}`;
}

export async function verifyGateCookie(token: string | undefined | null): Promise<GatePayload | null> {
  if (!token || !demoGateEnabled()) return null;
  const secret = gateSecret();
  if (!secret) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = await hmacHex(secret, body);
  if (sig.length !== expected.length) return null;
  let ok = 0;
  for (let i = 0; i < sig.length; i++) ok |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (ok !== 0) return null;
  try {
    const json = JSON.parse(fromBase64Url(body)) as GatePayload;
    if (!json.exp || json.exp < Math.floor(Date.now() / 1000)) return null;
    if (emailAllowlist().length > 0 && !isEmailAllowed(json.email)) return null;
    return json;
  } catch {
    return null;
  }
}

export function gateCookieHeader(value: string, maxAge = COOKIE_TTL_SEC): string {
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${GATE_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearGateCookieHeader(): string {
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${GATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export type LoginResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

export function validateDemoLogin(input: {
  password?: string;
  email?: string;
}): LoginResult {
  if (!demoGateEnabled()) {
    return { ok: false, error: 'Demo gate is not configured' };
  }

  const email = normalizeEmail(input.email || '');
  const list = emailAllowlist();

  if (list.length) {
    if (!email) return { ok: false, error: 'ต้องใส่อีเมลที่ได้รับอนุญาต' };
    if (!isEmailAllowed(email)) return { ok: false, error: 'อีเมลนี้ไม่อยู่ในรายชื่อที่อนุญาต' };
  }

  if (demoPasswordConfigured()) {
    const expected = process.env.TRACE24_DEMO_PASSWORD!.trim();
    if ((input.password || '') !== expected) {
      return { ok: false, error: 'รหัสผ่านไม่ถูกต้อง' };
    }
  }

  return { ok: true, email: email || 'demo' };
}
