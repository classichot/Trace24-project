/** Open money observation pack with AI suspicion explanations. */

export async function openAuditObservationPack(agencyId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!agencyId) return { ok: false, error: 'ไม่มีรหัสหน่วยงาน' };

  const res = await fetch(
    `/api/agencies/${encodeURIComponent(agencyId)}/audit-observations?format=html&ai=1`
  );
  const html = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(html) as { error?: string };
      return { ok: false, error: j.error || `HTTP ${res.status}` };
    } catch {
      return { ok: false, error: html.slice(0, 160) || `HTTP ${res.status}` };
    }
  }

  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    return { ok: true };
  }

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank');
  if (!opened) {
    URL.revokeObjectURL(url);
    return { ok: false, error: 'เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาตป๊อปอัปแล้วลองอีกครั้ง' };
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { ok: true };
}
