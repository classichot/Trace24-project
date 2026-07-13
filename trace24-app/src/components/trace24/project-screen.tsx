'use client';

import { useTrace24 } from '@/context/trace24-context';
import { REVIEW_OPTIONS, sev } from '@/lib/utils';
import { RiskDisclaimer, SeverityBadge, selectStyle } from './ui';

type ProjectAlert = {
  tag: string;
  title: string;
  sevKey: string;
  conf?: string;
  facts?: string[][];
  explain?: string;
  innocent?: string;
  evidence?: string[];
};

type ProjectLike = {
  code?: string;
  name?: string;
  cat?: string;
  method?: string;
  methodShort?: string;
  fy?: string;
  announced?: string;
  budget?: string;
  ref?: string;
  award?: string;
  pct?: string;
  sevKey?: string;
  ind?: number;
  winner?: string | null;
  alerts?: ProjectAlert[];
  timeline?: [string, string, string][];
  related?: [string, string, string][];
};

export function ProjectScreen() {
  const {
    dataset,
    selProjectId,
    projectReview,
    setProjectReview,
    go,
  } = useTrace24();

  const projects = dataset.projects as unknown as Record<string, ProjectLike>;
  const pr0 =
    projects[selProjectId] ??
    projects[dataset.def?.project || ''] ??
    Object.values(projects)[0];

  if (!pr0) {
    return (
      <div
        data-screen-label="หน้าตรวจสอบโครงการ"
        style={{ maxWidth: 720, margin: '0 auto', padding: '48px 32px' }}
      >
        <div
          onClick={() => go('dashboard')}
          className="trace24-hover-text"
          style={{ fontSize: 13, color: '#55554F', cursor: 'pointer', display: 'inline-block' }}
        >
          ← แดชบอร์ด
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 500, margin: '24px 0 8px' }}>โหลดโครงการไม่สำเร็จ</h1>
        <div style={{ fontSize: 14, color: '#55554F', lineHeight: 1.55 }}>
          ไม่พบข้อมูลโครงการ「{selProjectId || '—'}」ในรายงานนี้ — ลองกลับแดชบอร์ดแล้วเลือกใหม่
          หรือสแกนหน่วยงานอีกครั้ง
        </div>
      </div>
    );
  }

  const prSev = sev(pr0.sevKey || 'Low');
  const contractors = dataset.contractors as unknown as Record<
    string,
    { name?: string; contracts?: number; total?: string; share?: string; shareNum?: string }
  >;
  const winnerId = pr0.winner || '';
  const winnerC = winnerId ? contractors[winnerId] : undefined;
  const reviewValue = projectReview[selProjectId] || 'ใหม่';
  const alerts = Array.isArray(pr0.alerts) ? pr0.alerts : [];
  const timeline = (Array.isArray(pr0.timeline) ? pr0.timeline : []) as [string, string, string][];
  const related = (Array.isArray(pr0.related) ? pr0.related : []) as [string, string, string][];

  return (
    <div
      data-screen-label="หน้าตรวจสอบโครงการ"
      style={{
        maxWidth: 1160,
        margin: '0 auto',
        padding: '36px 32px 80px',
        boxSizing: 'border-box',
      }}
    >
      <div
        onClick={() => go('dashboard')}
        className="trace24-hover-text"
        style={{ fontSize: 13, color: '#55554F', cursor: 'pointer', display: 'inline-block' }}
      >
        ← แดชบอร์ด
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
        <div style={{ fontSize: 12.5, color: '#55554F' }}>{pr0.code || '—'}</div>
        <span
          style={{
            fontSize: 10,
            letterSpacing: '.06em',
            padding: '3px 8px',
            border: `1px solid ${prSev.sevBorder}`,
            color: prSev.sevColor,
          }}
        >
          ความสำคัญ{prSev.sevLabel}
        </span>
      </div>

      <h1 style={{ fontSize: 27, fontWeight: 500, margin: '10px 0 8px', maxWidth: 820, lineHeight: 1.35 }}>
        {pr0.name || 'โครงการ'}
      </h1>
      <div style={{ fontSize: 13.5, color: '#55554F' }}>
        {[pr0.cat, pr0.method || pr0.methodShort, pr0.fy, pr0.announced ? `ประกาศผู้ชนะ ${pr0.announced}` : null]
          .filter(Boolean)
          .join(' · ')}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0,
          borderTop: '1px solid #111110',
          borderBottom: '1px solid #E4E4E0',
          marginTop: 28,
        }}
      >
        {[
          ['งบประมาณ', pr0.budget || '—'],
          ['ราคากลาง', pr0.ref || '—'],
          ['ราคาที่ตกลง', pr0.award || '—'],
        ].map(([label, value]) => (
          <div key={label as string} style={{ padding: '20px 20px 20px 0', borderRight: '1px solid #EEEEEA', marginRight: 20 }}>
            <div style={{ fontSize: 11, color: '#8B8B85' }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 500, marginTop: 8 }}>{value}</div>
          </div>
        ))}
        <div style={{ padding: '20px 0' }}>
          <div style={{ fontSize: 11, color: '#8B8B85' }}>ราคาที่ตกลง / ราคากลาง</div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 500,
              marginTop: 8,
              color: pr0.sevKey === 'High' ? 'var(--accent)' : '#111110',
            }}
          >
            {pr0.pct || '—'}
          </div>
          <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 3 }}>
            {pr0.pct && pr0.pct !== '—' ? 'ค่ากลางกลุ่มเปรียบเทียบ — รอเทียบกลุ่ม' : 'ยังไม่มีราคากลางเปรียบเทียบ'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 56, marginTop: 40, alignItems: 'start' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            สัญญาณความเสี่ยง{' '}
            <span style={{ fontWeight: 400, color: '#8B8B85' }}>· {pr0.ind ?? alerts.length} รายการ</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
            {alerts.length === 0 && (
              <div
                style={{
                  border: '1px solid #E4E4E0',
                  background: '#fff',
                  padding: '22px 24px',
                  fontSize: 13.5,
                  color: '#55554F',
                  lineHeight: 1.55,
                }}
              >
                ยังไม่มีสัญญาณความเสี่ยงที่คำนวณแล้วสำหรับโครงการนี้ — ข้อมูลมาจากสัญญาสาธารณะ
                เปิดผู้ช่วยสอบสวนเพื่อวิเคราะห์เพิ่ม
              </div>
            )}
            {alerts.map((a, i) => {
              const s = sev(a.sevKey);
              return (
                <div key={i} style={{ border: '1px solid #E4E4E0', background: '#fff', padding: '22px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10.5, letterSpacing: '.06em', color: '#8B8B85' }}>{a.tag}</span>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{a.title}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11.5, color: '#8B8B85' }}>{a.conf}</span>
                      <SeverityBadge label={s.sevLabel} color={s.sevColor} border={s.sevBorder} />
                    </div>
                  </div>
                  {(a.facts || []).length > 0 && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: 12,
                        margin: '16px 0',
                        padding: '14px 16px',
                        background: '#F6F6F3',
                      }}
                    >
                      {(a.facts || []).map((f, fi) => (
                        <div key={fi}>
                          <div style={{ fontSize: 11, color: '#8B8B85' }}>{f[0]}</div>
                          <div style={{ fontSize: 13, marginTop: 3 }}>{f[1]}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {a.explain && (
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: '#26261F', textWrap: 'pretty' }}>
                      {a.explain}
                    </p>
                  )}
                  {a.innocent && (
                    <div style={{ marginTop: 14, paddingLeft: 14, borderLeft: '2px solid #DDDDD8' }}>
                      <div style={{ fontSize: 11, color: '#8B8B85' }}>คำอธิบายโดยสุจริตที่เป็นไปได้</div>
                      <p
                        style={{
                          margin: '5px 0 0',
                          fontSize: 13,
                          lineHeight: 1.6,
                          color: '#55554F',
                          fontStyle: 'italic',
                          textWrap: 'pretty',
                        }}
                      >
                        {a.innocent}
                      </p>
                    </div>
                  )}
                  {(a.evidence || []).length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                      {(a.evidence || []).map((e) => (
                        <span
                          key={e}
                          className="trace24-chip"
                          style={{
                            fontSize: 11.5,
                            padding: '5px 10px',
                            border: '1px solid #DDDDD8',
                            color: '#55554F',
                            cursor: 'pointer',
                          }}
                        >
                          {e} ↗
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <RiskDisclaimer />

          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '40px 0 0' }}>ไทม์ไลน์เอกสาร</h2>
          <div style={{ marginTop: 16 }}>
            {timeline.length === 0 && (
              <div style={{ fontSize: 13.5, color: '#8B8B85', padding: '8px 0' }}>ยังไม่มีไทม์ไลน์เอกสาร</div>
            )}
            {timeline.map((tl, i) => (
              <div key={i} style={{ display: 'flex', gap: 0 }}>
                <div style={{ width: 104, flex: 'none', fontSize: 12.5, color: '#8B8B85', padding: '2px 0 22px' }}>
                  {tl[0]}
                </div>
                <div
                  style={{
                    flex: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    marginRight: 18,
                  }}
                >
                  <div style={{ width: 7, height: 7, background: '#111110', flex: 'none', marginTop: 5 }} />
                  <div style={{ width: 1, flex: 1, background: '#E4E4E0' }} />
                </div>
                <div style={{ padding: '0 0 22px', minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{tl[1]}</div>
                  <div
                    className="trace24-hover-text"
                    style={{
                      fontSize: 11.5,
                      color: '#8B8B85',
                      marginTop: 3,
                      cursor: 'pointer',
                      display: 'inline-block',
                    }}
                  >
                    {tl[2]} · ดูเอกสารต้นฉบับ ↗
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          <div>
            <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>ผู้รับจ้าง</h2>
            <div style={{ border: '1px solid #E4E4E0', background: '#fff', padding: '18px 20px', marginTop: 12 }}>
              {winnerC ? (
                <>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{winnerC.name}</div>
                  <div style={{ fontSize: 12, color: '#55554F', marginTop: 4 }}>
                    {winnerC.contracts ?? 0} สัญญา · {winnerC.total || '—'} ·{' '}
                    {winnerC.share || winnerC.shareNum || '—'}
                  </div>
                  <div
                    onClick={() => go('contractor', { selContractorId: winnerId })}
                    className="trace24-hover-muted"
                    style={{
                      fontSize: 12.5,
                      marginTop: 12,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textUnderlineOffset: 2,
                      display: 'inline-block',
                    }}
                  >
                    ดูโปรไฟล์ผู้รับจ้าง →
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13.5, color: '#55554F', lineHeight: 1.55 }}>
                  ยังไม่ทราบผู้ชนะจากประกาศ — อาจดึงจาก e-GP ไม่สำเร็จ หรือคอลัมน์ผู้ชนะในสัญญาไม่ครบ
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>โครงการที่เกี่ยวข้อง</h2>
            <div style={{ marginTop: 12, borderTop: '1px solid #111110' }}>
              {related.length === 0 && (
                <div style={{ padding: '12px 0', fontSize: 13, color: '#8B8B85' }}>
                  ยังไม่มีโครงการที่เกี่ยวข้องในรายงานนี้
                </div>
              )}
              {related.map((rp) => (
                <div
                  key={rp[0]}
                  onClick={() => go('project', { selProjectId: rp[0] })}
                  className="trace24-hover-row"
                  style={{ padding: '12px 0', borderBottom: '1px solid #EEEEEA', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 13 }}>{rp[1]}</div>
                  <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 3, lineHeight: 1.5 }}>{rp[2]}</div>
                </div>
              ))}
            </div>
            <div
              onClick={() => go('graph')}
              className="trace24-hover-muted"
              style={{
                fontSize: 12.5,
                marginTop: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
                display: 'inline-block',
              }}
            >
              สำรวจในกราฟความสัมพันธ์ →
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>การตรวจสอบโดยเจ้าหน้าที่</h2>
            <select
              value={reviewValue}
              onChange={(e) => setProjectReview(selProjectId, e.target.value)}
              style={{ ...selectStyle, width: '100%', marginTop: 12 }}
            >
              {REVIEW_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 8, lineHeight: 1.55 }}>
              ทุกการตรวจสอบถูกบันทึกพร้อมชื่อผู้ดำเนินการ สามารถส่งออกรายงานหลักฐานได้
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
