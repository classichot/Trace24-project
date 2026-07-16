/** Browser helper for agency LLM assists */

export async function callAgencyLlm<T = Record<string, unknown>>(
  agencyId: string,
  action: string,
  body: Record<string, unknown> = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/agencies/${encodeURIComponent(agencyId)}/llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; hint?: string };
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || data.hint || `HTTP ${res.status}`,
      };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}
