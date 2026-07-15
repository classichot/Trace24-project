/** Client helpers for Admin write APIs (token in sessionStorage). */

const STORAGE_KEY = 'trace24_admin_token';

export function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setAdminToken(token: string) {
  if (typeof window === 'undefined') return;
  try {
    const t = token.trim();
    if (t) sessionStorage.setItem(STORAGE_KEY, t);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function adminWriteHeaders(extra?: HeadersInit): HeadersInit {
  const token = getAdminToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'x-trace24-admin-token': token } : {}),
    ...extra,
  };
}

/** If response is 401/503 admin-auth, return a user-facing Thai message. */
export async function adminWriteError(res: Response, data: { error?: string; hint?: string }): Promise<string> {
  if (res.status === 401) {
    return 'ต้องใส่ Admin token ก่อน (ช่องด้านบนแท็บ Admin) — หรือตรวจว่า token ตรงกับ TRACE24_ADMIN_TOKEN';
  }
  if (res.status === 503 && /Admin writes disabled|TRACE24_ADMIN_TOKEN/i.test(data.error || '')) {
    return 'Production ยังไม่ได้ตั้ง TRACE24_ADMIN_TOKEN บน Vercel — ตั้งค่าแล้ว redeploy';
  }
  return data.error || data.hint || `HTTP ${res.status}`;
}
