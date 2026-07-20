/** Fetch investigation observation pack (JSON + AI) for in-app web view. */

import type { AuditObservationPack } from '@/lib/audit/observation-types';

export async function fetchAuditObservationPack(
  agencyId: string
): Promise<{ ok: true; pack: AuditObservationPack } | { ok: false; error: string }> {
  if (!agencyId) return { ok: false, error: 'ไม่มีรหัสหน่วยงาน' };

  try {
    const res = await fetch(
      `/api/agencies/${encodeURIComponent(agencyId)}/audit-observations?format=json&ai=1`
    );
    const data = (await res.json().catch(() => ({}))) as AuditObservationPack & {
      error?: string;
      hint?: string;
    };
    if (!res.ok) {
      return { ok: false, error: data.error || data.hint || `HTTP ${res.status}` };
    }
    if (!data.agencyId && !data.agencyName) {
      return { ok: false, error: 'รูปแบบชุดสรุปไม่ถูกต้อง' };
    }
    return { ok: true, pack: data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

/** @deprecated use fetchAuditObservationPack + ObservationPackPanel */
export async function openAuditObservationPack(
  agencyId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const out = await fetchAuditObservationPack(agencyId);
  if (!out.ok) return out;
  return { ok: true };
}
