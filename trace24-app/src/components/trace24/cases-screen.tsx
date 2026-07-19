'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTrace24 } from '@/context/trace24-context';
import { CASE_STATUSES, type CasePriority, type CaseStatus, type OversightCase } from '@/lib/cases/types';

type QueuePayload = {
  open: OversightCase[];
  closed: OversightCase[];
  byAssignee: { assignee: string; count: number }[];
};

const jsonHeaders = { 'Content-Type': 'application/json' };

export function CasesScreen() {
  const {
    go,
    scannedId,
    muni,
    dataset,
    selCaseId,
    setSelCaseId,
    pendingOpenCase,
    setPendingOpenCase,
  } = useTrace24();
  const [queue, setQueue] = useState<QueuePayload | null>(null);
  const [selected, setSelected] = useState<OversightCase | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [assigneeDraft, setAssigneeDraft] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const openingRef = useRef(false);

  const loadQueue = useCallback(async () => {
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    try {
      const res = await fetch(`/api/org/queue${qs}`);
      const data = (await res.json()) as QueuePayload & { error?: string };
      if (!res.ok) {
        setErr(data.error || `โหลดคิวไม่สำเร็จ (HTTP ${res.status})`);
        return;
      }
      setQueue(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โหลดคิวไม่สำเร็จ');
    }
  }, [statusFilter]);

  const loadCase = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(id)}`);
      const data = (await res.json()) as { case?: OversightCase; error?: string };
      if (!res.ok || !data.case) {
        setErr(data.error || 'โหลดสำนวนไม่สำเร็จ');
        return;
      }
      setSelected(data.case);
      setAssigneeDraft(data.case.assignee || '');
      setSelCaseId(data.case.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โหลดสำนวนไม่สำเร็จ');
    }
  }, [setSelCaseId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (selCaseId) void loadCase(selCaseId);
  }, [selCaseId, loadCase]);

  const openFromAgency = useCallback(async () => {
    const agencyId = scannedId || muni.id;
    if (!agencyId || busy || openingRef.current) return;
    openingRef.current = true;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const tags = (dataset.relatedParty?.matches || [])
        .map((m) => m.ruleId)
        .filter(Boolean)
        .slice(0, 8) as string[];
      const caseSummary =
        typeof dataset.caseFile?.summary === 'string' ? dataset.caseFile.summary : '';
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          agencyId,
          agencyName: muni.th,
          province: muni.prov,
          agencyType: muni.tshort || muni.type,
          title: `สำนวนตรวจ — ${muni.th}`,
          summary: caseSummary || 'เปิดจากแดชบอร์ดหน่วยงานเพื่อติดตามในคิวงานองค์กร',
          priority: 'High' as CasePriority,
          signalTags: tags,
          openedBy: 'ผู้ใช้เดโม',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        case?: OversightCase;
        error?: string;
        hint?: string;
      };
      if (!res.ok) {
        setErr(data.error || data.hint || `เปิดสำนวนไม่สำเร็จ (HTTP ${res.status})`);
        return;
      }
      if (!data.case) {
        setErr('เปิดสำนวนแล้วแต่เซิร์ฟเวอร์ไม่ส่งข้อมูลกลับ');
        return;
      }
      const created = data.case;
      setMsg(`เปิดสำนวนแล้ว: ${created.id} · ${created.agencyName}`);
      setSelected(created);
      setSelCaseId(created.id);
      setAssigneeDraft(created.assignee || '');
      // Optimistic queue update (Vercel /tmp may not be visible on another instance yet)
      setQueue((q) => {
        const open = [created, ...(q?.open || []).filter((c) => c.id !== created.id)];
        const closed = (q?.closed || []).filter((c) => c.id !== created.id);
        return {
          open,
          closed,
          byAssignee: q?.byAssignee || [],
        };
      });
      void loadQueue();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เปิดสำนวนไม่สำเร็จ');
    } finally {
      setBusy(false);
      openingRef.current = false;
    }
  }, [scannedId, muni, dataset, busy, setSelCaseId, loadQueue]);

  useEffect(() => {
    if (!pendingOpenCase) return;
    setPendingOpenCase(false);
    void openFromAgency();
  }, [pendingOpenCase, setPendingOpenCase, openFromAgency]);

  const patch = async (body: Record<string, unknown>) => {
    if (!selected || busy) return false;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        case?: OversightCase;
        error?: string;
        hint?: string;
      };
      if (!res.ok) {
        setErr(data.error || data.hint || `บันทึกไม่สำเร็จ (HTTP ${res.status})`);
        return false;
      }
      if (data.case) {
        setSelected(data.case);
        setMsg('บันทึกแล้ว');
        void loadQueue();
        return true;
      }
      setErr('บันทึกแล้วแต่เซิร์ฟเวอร์ไม่ส่งข้อมูลกลับ');
      return false;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const items = [...(queue?.open || []), ...(queue?.closed || [])];

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '36px 28px 100px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#8B8B85', fontWeight: 500 }}>
            CASE WORKSPACE · คิวงานองค์กร
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 500, margin: '8px 0 6px' }}>สำนวนและคิวงาน</h1>
          <div style={{ fontSize: 13.5, color: '#55554F' }}>
            เปิดเคส · มอบหมาย · อัปเดตสถานะ · บันทึก · ส่งออกรายงานราชการ
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div
            onClick={() => go('org')}
            className="trace24-hover-text"
            style={{
              padding: '10px 14px',
              fontSize: 13,
              border: '1px solid #D8D8D2',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            ภาพรวมจังหวัด/ประเภท
          </div>
          <div
            onClick={() => void openFromAgency()}
            className="trace24-btn-dark"
            style={{
              padding: '10px 14px',
              fontSize: 13,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.7 : 1,
              userSelect: 'none',
            }}
          >
            {busy ? 'กำลังเปิด…' : `เปิดสำนวนจาก ${muni.th || 'หน่วยงาน'}`}
          </div>
        </div>
      </div>

      {(err || msg) && (
        <div
          style={{
            marginTop: 16,
            padding: '12px 14px',
            fontSize: 13.5,
            lineHeight: 1.5,
            color: err ? '#6B2D1F' : '#33332E',
            background: err ? '#F8EDE8' : '#F6F6F3',
            borderTop: `2px solid ${err ? 'var(--accent)' : '#111110'}`,
          }}
        >
          {err || msg}
        </div>
      )}

      <div
        style={{
          marginTop: 28,
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.4fr)',
          gap: 28,
        }}
        className="trace24-cases-grid"
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>คิวงานทั้งองค์กร</h2>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ fontSize: 12.5, padding: '4px 8px', border: '1px solid #D8D8D2', background: '#fff' }}
            >
              <option value="">ทุกสถานะ</option>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {queue?.byAssignee && queue.byAssignee.length > 0 && (
            <div style={{ fontSize: 12, color: '#8B8B85', marginBottom: 12, lineHeight: 1.5 }}>
              ภาระงาน:{' '}
              {queue.byAssignee.map((a) => `${a.assignee} (${a.count})`).join(' · ')}
            </div>
          )}

          <div style={{ borderTop: '1px solid #E6E6E0' }}>
            {items.length === 0 && (
              <div style={{ padding: '16px 0', fontSize: 13.5, color: '#8B8B85' }}>
                ยังไม่มีสำนวนในคิว — กดเปิดสำนวนจากหน่วยงานที่สแกนไว้
              </div>
            )}
            {items.map((c) => {
              const active = selected?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => void loadCase(c.id)}
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid #E6E6E0',
                    cursor: 'pointer',
                    background: active ? '#F6F6F3' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 560 }}>{c.agencyName}</div>
                    <div style={{ fontSize: 11.5, color: c.priority === 'High' ? 'var(--accent)' : '#8B8B85' }}>
                      {c.priority}
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#55554F', marginTop: 3 }}>{c.title}</div>
                  <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 4 }}>
                    {c.status} · {c.assignee || 'ยังไม่มอบหมาย'}
                    {c.province ? ` · จ.${c.province}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          {!selected ? (
            <div style={{ padding: '24px 0', fontSize: 13.5, color: '#8B8B85' }}>
              เลือกสำนวนจากคิวด้านซ้าย หรือเปิดสำนวนใหม่จากหน่วยงานปัจจุบัน
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#8B8B85' }}>{selected.id}</div>
                  <h2 style={{ fontSize: 20, fontWeight: 560, margin: '6px 0' }}>{selected.title}</h2>
                  <div style={{ fontSize: 13, color: '#55554F' }}>
                    {selected.agencyName}
                    {selected.province ? ` · จ.${selected.province}` : ''}
                  </div>
                </div>
                <a
                  href={`/api/cases/${encodeURIComponent(selected.id)}/export`}
                  target="_blank"
                  rel="noreferrer"
                  className="trace24-btn-dark"
                  style={{
                    padding: '10px 14px',
                    fontSize: 13,
                    textDecoration: 'none',
                    color: '#fbfbf9',
                    display: 'inline-block',
                  }}
                >
                  ส่งออกรายงานราชการ (PDF)
                </a>
              </div>

              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#33332E', marginTop: 16 }}>
                {selected.summary}
              </p>

              <div
                style={{
                  marginTop: 18,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                <label style={{ fontSize: 12, color: '#55554F', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  สถานะ
                  <select
                    value={selected.status}
                    onChange={(e) => void patch({ status: e.target.value as CaseStatus })}
                    style={{ fontSize: 13, padding: '8px 10px', border: '1px solid #D8D8D2' }}
                  >
                    {CASE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: '#55554F', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  ความสำคัญ
                  <select
                    value={selected.priority}
                    onChange={(e) => void patch({ priority: e.target.value as CasePriority })}
                    style={{ fontSize: 13, padding: '8px 10px', border: '1px solid #D8D8D2' }}
                  >
                    {(['High', 'Medium', 'Low'] as CasePriority[]).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <label style={{ flex: 1, fontSize: 12, color: '#55554F', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  มอบหมายให้
                  <input
                    value={assigneeDraft}
                    onChange={(e) => setAssigneeDraft(e.target.value)}
                    placeholder="ชื่อนักวิเคราะห์ / ทีม"
                    style={{ fontSize: 13, padding: '8px 10px', border: '1px solid #D8D8D2' }}
                  />
                </label>
                <div
                  onClick={() =>
                    void patch({
                      assignee: assigneeDraft,
                      status:
                        selected.status === 'เปิดใหม่' && assigneeDraft.trim()
                          ? 'มอบหมายแล้ว'
                          : selected.status,
                      note: assigneeDraft.trim()
                        ? { by: 'ผู้ใช้เดโม', text: `มอบหมายให้ ${assigneeDraft.trim()}` }
                        : undefined,
                    })
                  }
                  className="trace24-btn-dark"
                  style={{
                    padding: '9px 14px',
                    fontSize: 13,
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  บันทึกมอบหมาย
                </div>
              </div>

              <div style={{ marginTop: 22 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>เอกสารที่ขาด</h3>
                {(selected.missingDocuments || []).length === 0 ? (
                  <div style={{ fontSize: 13, color: '#8B8B85' }}>—</div>
                ) : (
                  selected.missingDocuments.map((d) => (
                    <div key={d} style={{ fontSize: 13, color: '#33332E', marginTop: 3 }}>
                      · {d}
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginTop: 18 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>แหล่งอ้างอิง</h3>
                {(selected.citations || []).map((c) => (
                  <div key={`${c.label}-${c.detail || ''}`} style={{ fontSize: 13, color: '#55554F', marginTop: 3 }}>
                    · {c.label}
                    {c.detail ? ` — ${c.detail}` : ''}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 18 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>บันทึก</h3>
                {(selected.notes || []).map((n) => (
                  <div
                    key={n.id}
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      padding: '8px 0',
                      borderBottom: '1px solid #E6E6E0',
                      color: '#33332E',
                    }}
                  >
                    <span style={{ color: '#8B8B85', fontSize: 11.5 }}>
                      {new Date(n.at).toLocaleString('th-TH')} · {n.by}
                    </span>
                    <div>{n.text}</div>
                  </div>
                ))}
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  placeholder="เพิ่มบันทึกการตรวจ…"
                  style={{
                    width: '100%',
                    marginTop: 10,
                    fontSize: 13,
                    padding: 10,
                    border: '1px solid #D8D8D2',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
                <div
                  onClick={() => {
                    if (!noteText.trim()) return;
                    void (async () => {
                      const ok = await patch({
                        note: { by: 'ผู้ใช้เดโม', text: noteText.trim() },
                      });
                      if (ok) setNoteText('');
                    })();
                  }}
                  style={{
                    marginTop: 8,
                    display: 'inline-block',
                    padding: '8px 12px',
                    fontSize: 13,
                    border: '1px solid #111110',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  เพิ่มบันทึก
                </div>
              </div>

              <div
                onClick={() =>
                  go('dashboard', {
                    selMuniId: selected.agencyId,
                    scannedId: selected.agencyId,
                  })
                }
                className="trace24-hover-text"
                style={{
                  marginTop: 24,
                  fontSize: 13,
                  cursor: 'pointer',
                  color: '#55554F',
                  textDecoration: 'underline',
                }}
              >
                เปิดแดชบอร์ดหน่วยงานนี้ →
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .trace24-cases-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
