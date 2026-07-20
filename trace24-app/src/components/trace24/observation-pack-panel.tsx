'use client';

import { useMemo } from 'react';
import { exportObservationPack } from '@/lib/audit/observation-export';
import type { AuditObservationPack, MoneyObservation } from '@/lib/audit/observation-types';
import { OBSERVATION_PACK_TITLE } from '@/lib/audit/observation-types';
import { sev } from '@/lib/utils';
import { SeverityBadge } from './ui';

type Props = {
  pack: AuditObservationPack;
  onClose: () => void;
};

export function ObservationPackPanel({ pack, onClose }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<string, MoneyObservation[]>();
    for (const o of pack.observations) {
      const list = map.get(o.section) || [];
      list.push(o);
      map.set(o.section, list);
    }
    return [...map.entries()];
  }, [pack.observations]);

  const exportBtn = (label: string, format: 'pdf' | 'text' | 'word') => (
    <button
      type="button"
      onClick={() => exportObservationPack(pack, format)}
      style={{
        padding: '9px 14px',
        fontSize: 12.5,
        border: '1px solid #D8D8D2',
        background: '#fff',
        cursor: 'pointer',
        color: '#111110',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={OBSERVATION_PACK_TITLE}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(17,17,16,0.45)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'stretch',
        padding: '24px 16px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(980px, 100%)',
          background: '#FBFBF9',
          border: '1px solid #111110',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '100%',
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            padding: '18px 22px',
            borderBottom: '1px solid #E4E4E0',
            flex: 'none',
            background: '#fff',
          }}
        >
          <div>
            <div style={{ fontSize: 11, letterSpacing: '.07em', color: '#8B8B85', fontWeight: 500 }}>
              TRACE24 · แสดงผลบนเว็บ
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: '6px 0 4px', lineHeight: 1.35 }}>
              {OBSERVATION_PACK_TITLE}
            </h2>
            <div style={{ fontSize: 13.5, color: '#55554F' }}>
              {pack.agencyName}
              {pack.province ? ` · จ.${pack.province}` : ''}
              {pack.agencyType ? ` · ${pack.agencyType}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: '1px solid #D8D8D2',
              background: '#fff',
              padding: '8px 12px',
              fontSize: 13,
              cursor: 'pointer',
              flex: 'none',
            }}
          >
            ปิด
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
            padding: '12px 22px',
            borderBottom: '1px solid #EEEEEA',
            background: '#F6F6F3',
            flex: 'none',
          }}
        >
          <span style={{ fontSize: 12, color: '#8B8B85', marginRight: 4 }}>ส่งออก:</span>
          {exportBtn('PDF (พิมพ์)', 'pdf')}
          {exportBtn('ข้อความ (.txt)', 'text')}
          {exportBtn('Word (.doc)', 'word')}
          <span style={{ fontSize: 11.5, color: '#8B8B85', marginLeft: 'auto' }}>
            PDF = เปิดหน้าพิมพ์ แล้วเลือก Save as PDF
          </span>
        </div>

        <div style={{ overflow: 'auto', padding: '22px 24px 40px', flex: 1 }}>
          <div style={{ fontSize: 12.5, color: '#55554F', lineHeight: 1.55, marginBottom: 16 }}>
            {pack.disclaimer}
          </div>
          {pack.aiError && (
            <div style={{ fontSize: 12.5, color: 'var(--accent)', marginBottom: 14, lineHeight: 1.5 }}>
              AI อธิบายเพิ่มไม่สำเร็จ: {pack.aiError} — ใช้คำอธิบายจากกฎตรวจแทน
            </div>
          )}
          {pack.aiModel && (
            <div style={{ fontSize: 11.5, color: '#8B8B85', marginBottom: 12 }}>
              อธิบายด้วย AI · {pack.aiModel} · สร้างเมื่อ{' '}
              {new Date(pack.generatedAt).toLocaleString('th-TH')}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 0,
              borderTop: '1px solid #111110',
              borderBottom: '1px solid #E4E4E0',
              marginBottom: 22,
            }}
          >
            {[
              ['โครงการในรายงาน', String(pack.summary.projectCount)],
              ['ประเด็น', `${pack.summary.observationCount} (High ${pack.summary.highCount})`],
              ['มูลค่ารวมโดยประมาณ', pack.summary.totalAwardLabel],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: '14px 16px 14px 0', borderRight: '1px solid #EEEEEA' }}>
                <div style={{ fontSize: 11, color: '#8B8B85' }}>{k}</div>
                <div style={{ fontSize: 18, fontWeight: 500, marginTop: 6 }}>{v}</div>
              </div>
            ))}
          </div>

          {pack.aiNarrative && (
            <section style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>สรุปภาพรวมโดย AI</h3>
              <div
                style={{
                  padding: '14px 16px',
                  background: '#fff',
                  borderTop: '2px solid #111110',
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                {pack.aiNarrative}
              </div>
            </section>
          )}

          <section style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>สรุปตามหมวด</h3>
            <div style={{ borderTop: '1px solid #111110' }}>
              {Object.entries(pack.summary.bySection).length === 0 && (
                <div style={{ padding: '12px 0', fontSize: 13, color: '#8B8B85' }}>
                  ไม่พบสัญญาณมูลค่าเงินในแคชนี้ — ยังใช้เป็นฐานขอเอกสารได้
                </div>
              )}
              {Object.entries(pack.summary.bySection).map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: '1px solid #EEEEEA',
                    fontSize: 13.5,
                  }}
                >
                  <span>{k}</span>
                  <span style={{ color: '#55554F' }}>{v} ประเด็น</span>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>ผู้รับจ้างมูลค่าสูง</h3>
            <div style={{ borderTop: '1px solid #111110' }}>
              {pack.topWinners.length === 0 && (
                <div style={{ padding: '12px 0', fontSize: 13, color: '#8B8B85' }}>ไม่มีข้อมูลผู้ชนะในแคช</div>
              )}
              {pack.topWinners.map((w) => (
                <div
                  key={w.name + w.total}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 120px 100px',
                    gap: 12,
                    padding: '11px 0',
                    borderBottom: '1px solid #EEEEEA',
                    fontSize: 13.5,
                  }}
                >
                  <span>{w.name}</span>
                  <span style={{ color: '#55554F' }}>{w.total}</span>
                  <span style={{ color: '#8B8B85' }}>{w.shareHint || '—'}</span>
                </div>
              ))}
            </div>
          </section>

          {grouped.map(([sec, rows]) => (
            <section key={sec} style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>
                {sec} ({rows.length})
              </h3>
              <div style={{ borderTop: '1px solid #111110' }}>
                {rows.map((o) => {
                  const s = sev(o.severity);
                  return (
                    <article
                      key={o.id}
                      style={{
                        padding: '16px 0',
                        borderBottom: '1px solid #EEEEEA',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          alignItems: 'baseline',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 11, color: '#8B8B85', letterSpacing: '.04em' }}>
                            {o.ruleTag}
                          </div>
                          <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 4, lineHeight: 1.45 }}>
                            {o.projectName}
                          </div>
                          <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 3 }}>
                            {o.projectId} · ปีงบ {o.fy} · {o.winner} · วงเงิน {o.award}
                          </div>
                        </div>
                        <SeverityBadge label={s.sevLabel} color={s.sevColor} border={s.sevBorder} />
                      </div>
                      <div style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 10, color: '#33332E' }}>
                        <span style={{ color: '#8B8B85' }}>สัญญาณ: </span>
                        {o.text}
                      </div>
                      <div
                        style={{
                          marginTop: 12,
                          padding: '12px 14px',
                          background: '#fff',
                          borderLeft: '3px solid #111110',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                          <div style={{ fontSize: 11, letterSpacing: '.04em', color: '#8B8B85', marginBottom: 3 }}>
                            ทำไมน่าสงสัย
                          </div>
                          {o.suspicionWhy || o.text}
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.55, color: '#33332E' }}>
                          <div style={{ fontSize: 11, letterSpacing: '.04em', color: '#8B8B85', marginBottom: 3 }}>
                            คำอธิบายที่เป็นไปได้
                          </div>
                          {o.innocentAlternative ||
                            'อาจมีเหตุผลทางเทคนิค งบประมาณ หรือสภาพตลาด — ต้องดูเอกสารก่อนตัดประเด็น'}
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.55, color: '#33332E' }}>
                          <div style={{ fontSize: 11, letterSpacing: '.04em', color: '#8B8B85', marginBottom: 3 }}>
                            แนวทางตรวจยืนยัน
                          </div>
                          {o.whatToVerify || o.suggestedCheck}
                          {o.whatToVerify &&
                            o.suggestedCheck &&
                            o.whatToVerify !== o.suggestedCheck && (
                              <div style={{ marginTop: 4, color: '#55554F', fontSize: 12.5 }}>
                                เพิ่มเติม: {o.suggestedCheck}
                              </div>
                            )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}

          <section>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>เอกสารที่ควรขอเพื่อตรวจต่อ</h3>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.65 }}>
              {pack.documentRequests.map((d) => (
                <li key={d} style={{ marginBottom: 4 }}>
                  {d}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
