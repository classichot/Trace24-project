'use client';

import { useTrace24 } from '@/context/trace24-context';
import { REVIEW_OPTIONS, sev } from '@/lib/utils';
import { SeverityBadge, inputStyle, selectStyle } from './ui';

const ADMIN_TABS = [
  ['crawl', 'การเก็บข้อมูล'],
  ['queue', 'คิวประมวลผลเอกสาร'],
  ['entities', 'ตรวจการจับคู่นิติบุคคล'],
  ['review', 'สถานะการตรวจสอบ'],
  ['case', 'พื้นที่ทำงานคดี'],
] as const;

export function AdminScreen() {
  const {
    dataset,
    adminTab,
    setAdminTab,
    erDecisions,
    setErDecision,
    reviewStates,
    setReviewState,
    caseNote,
    setCaseNote,
    addCaseNote,
    caseNotesAdded,
  } = useTrace24();

  const CF = dataset.caseFile;
  const caseAdded = caseNotesAdded[CF.id] ?? [];
  const caseNotes = [
    ...caseAdded.map((n) => ({ date: n[0], text: n[1] })),
    ...CF.notes.map((n) => ({ date: n[0], text: n[1] })),
  ];

  return (
    <div
      data-screen-label="ระบบภายใน"
      style={{
        maxWidth: 1160,
        margin: '0 auto',
        padding: '36px 32px 80px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <h1 style={{ fontSize: 26, fontWeight: 500, margin: 0 }}>ระบบผู้ดูแล</h1>
        <span
          style={{
            fontSize: 10,
            letterSpacing: '.08em',
            padding: '3px 8px',
            border: '1px solid #C9C9C4',
            color: '#55554F',
          }}
        >
          ภายใน · จำกัดสิทธิ์
        </span>
      </div>

      <div style={{ display: 'flex', gap: 26, borderBottom: '1px solid #E4E4E0', marginTop: 24, flexWrap: 'wrap' }}>
        {ADMIN_TABS.map(([key, label]) => {
          const active = adminTab === key;
          return (
            <div
              key={key}
              onClick={() => setAdminTab(key)}
              className="trace24-tab"
              style={{
                fontSize: 13.5,
                padding: '0 2px 12px',
                cursor: 'pointer',
                borderBottom: `2px solid ${active ? '#111110' : 'transparent'}`,
                color: active ? '#111110' : '#8B8B85',
                marginBottom: -1,
              }}
            >
              {label}
            </div>
          );
        })}
      </div>

      {adminTab === 'crawl' && (
        <div style={{ marginTop: 28 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 170px 110px 110px 90px',
              gap: 16,
              padding: '10px 0',
              borderBottom: '1px solid #E4E4E0',
              fontSize: 11,
              color: '#8B8B85',
            }}
          >
            <div>แหล่งข้อมูล</div>
            <div>ประเภท</div>
            <div>สถานะ</div>
            <div>เก็บล่าสุด</div>
            <div>เอกสาร</div>
          </div>
          {dataset.sources.map((src, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 170px 110px 110px 90px',
                gap: 16,
                padding: '14px 0',
                borderBottom: '1px solid #EEEEEA',
                alignItems: 'baseline',
              }}
            >
              <div style={{ fontSize: 13.5 }}>{src.url}</div>
              <div style={{ fontSize: 12.5, color: '#55554F' }}>{src.type}</div>
              <div style={{ fontSize: 12, color: src.ok ? '#55554F' : 'var(--accent)' }}>{src.status}</div>
              <div style={{ fontSize: 12.5, color: '#55554F' }}>{src.last}</div>
              <div style={{ fontSize: 12.5 }}>{src.docs}</div>
            </div>
          ))}
          <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 14 }}>
            ตรวจแหล่งข้อมูลซ้ำทุก 24 ชม. — บันทึกเวลาดึงข้อมูลและค่าแฮชของไฟล์ทุกครั้ง
          </div>
        </div>
      )}

      {adminTab === 'queue' && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', gap: 36, paddingBottom: 20, borderBottom: '1px solid #E4E4E0', flexWrap: 'wrap' }}>
            {dataset.queueStats.map((qs, i) => (
              <div key={i}>
                <div style={{ fontSize: 22, fontWeight: 500 }}>{qs.n}</div>
                <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 3 }}>{qs.label}</div>
              </div>
            ))}
          </div>
          {dataset.queueRows.map((q, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 1fr 170px 100px 170px',
                gap: 16,
                padding: '14px 0',
                borderBottom: '1px solid #EEEEEA',
                alignItems: 'baseline',
              }}
            >
              <div style={{ fontSize: 12.5, color: '#55554F' }}>{q.id}</div>
              <div style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
              <div style={{ fontSize: 12.5, color: '#55554F' }}>{q.type}</div>
              <div style={{ fontSize: 12.5, color: '#55554F' }}>{q.fmt}</div>
              <div
                style={{
                  fontSize: 12,
                  color: q.ok === true ? '#55554F' : q.ok === false ? 'var(--accent)' : '#111110',
                }}
              >
                {q.status}
              </div>
            </div>
          ))}
        </div>
      )}

      {adminTab === 'entities' && (
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, color: '#55554F', maxWidth: 680, lineHeight: 1.6 }}>
            การจับคู่ที่ไม่แน่นอนจะไม่ถูกรวมโดยอัตโนมัติ — การรวมผิดอาจสร้างความสัมพันธ์เท็จ ทุกการตัดสินใจด้านล่างถูกบันทึกพร้อมชื่อผู้ดำเนินการ
          </div>
          {dataset.erRows.map((er) => {
            const dec = erDecisions[er.id];
            return (
              <div key={er.id} style={{ border: '1px solid #E4E4E0', background: '#fff', padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{er.a}</div>
                  <div style={{ fontSize: 12, color: '#8B8B85' }}>≟</div>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{er.b}</div>
                  <div style={{ flex: 1 }} />
                  <div style={{ fontSize: 12, color: '#55554F' }}>ความคล้าย {er.sim}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {er.ev.map((ee) => (
                    <span key={ee} style={{ fontSize: 11.5, padding: '4px 10px', background: '#F6F6F3', color: '#55554F' }}>
                      {ee}
                    </span>
                  ))}
                </div>
                {!dec && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <div
                      onClick={() => setErDecision(er.id, 'รวมเป็นรายเดียวกัน')}
                      className="trace24-btn-dark"
                      style={{ padding: '9px 18px', fontSize: 12.5 }}
                    >
                      รวมเป็นรายเดียวกัน
                    </div>
                    <div
                      onClick={() => setErDecision(er.id, 'แยกไว้ต่างราย')}
                      style={{
                        border: '1px solid #C9C9C4',
                        padding: '9px 18px',
                        fontSize: 12.5,
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      className="trace24-btn-outline"
                    >
                      แยกไว้ต่างราย
                    </div>
                  </div>
                )}
                {dec && (
                  <div style={{ marginTop: 16, fontSize: 12.5, color: '#55554F' }}>
                    บันทึกผลแล้ว: <span style={{ fontWeight: 600, color: '#111110' }}>{dec}</span> · ระบุชื่อผู้ตรวจ · ลงบันทึกตรวจสอบ
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adminTab === 'review' && (
        <div style={{ marginTop: 28 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '104px 1fr 100px 220px',
              gap: 16,
              padding: '10px 0',
              borderBottom: '1px solid #E4E4E0',
              fontSize: 11,
              color: '#8B8B85',
            }}
          >
            <div>โครงการ</div>
            <div>สัญญาณ</div>
            <div>ระดับ</div>
            <div>สถานะการตรวจสอบ</div>
          </div>
          {dataset.adminReviewRows.map((rr) => {
            const s = sev(rr.sevKey);
            return (
              <div
                key={rr.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '104px 1fr 100px 220px',
                  gap: 16,
                  padding: '12px 0',
                  borderBottom: '1px solid #EEEEEA',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: 12.5, color: '#55554F' }}>{rr.code}</div>
                <div style={{ fontSize: 13.5 }}>{rr.title}</div>
                <div>
                  <SeverityBadge label={s.sevLabel} color={s.sevColor} border={s.sevBorder} />
                </div>
                <select
                  value={reviewStates[rr.key] || rr.def}
                  onChange={(e) => setReviewState(rr.key, e.target.value)}
                  style={{ ...selectStyle, width: '100%', padding: '8px 10px', fontSize: 12.5 }}
                >
                  {REVIEW_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            );
          })}
          <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 14 }}>
            ผู้ตรวจสามารถเพิ่มบันทึก แก้ไขค่าที่สกัดได้ แนบหลักฐาน และส่งออกรายงานหลักฐาน — ทุกการกระทำถูกลงบันทึกตรวจสอบ
          </div>
        </div>
      )}

      {adminTab === 'case' && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 12.5, color: '#55554F' }}>{CF.id}</div>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: '.06em',
                    padding: '3px 8px',
                    border: '1px solid var(--accent)',
                    color: 'var(--accent)',
                  }}
                >
                  {CF.status}
                </span>
              </div>
              <h2 style={{ fontSize: 21, fontWeight: 600, margin: '10px 0 6px', maxWidth: 720, lineHeight: 1.4 }}>
                {CF.title}
              </h2>
              <div style={{ fontSize: 12.5, color: '#8B8B85' }}>
                {CF.opened} · {CF.owner}
              </div>
            </div>
            <div
              className="trace24-btn-outline"
              style={{
                border: '1px solid #111110',
                padding: '11px 18px',
                fontSize: 13,
                cursor: 'pointer',
                userSelect: 'none',
                flex: 'none',
              }}
            >
              ส่งออกสำนวนหลักฐาน (PDF)
            </div>
          </div>
          <p
            style={{
              margin: '20px 0 0',
              padding: '18px 22px',
              background: '#F6F6F3',
              fontSize: 13.5,
              lineHeight: 1.7,
              color: '#26261F',
              maxWidth: 900,
              textWrap: 'pretty',
            }}
          >
            {CF.summary}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 48, marginTop: 36, alignItems: 'start' }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>ไทม์ไลน์รวมของคดี</h2>
              <div style={{ marginTop: 16 }}>
                {CF.timeline.map((ct, i) => (
                  <div key={i} style={{ display: 'flex', gap: 0 }}>
                    <div style={{ width: 104, flex: 'none', fontSize: 12.5, color: '#8B8B85', padding: '2px 0 20px' }}>
                      {ct[0]}
                    </div>
                    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: 18 }}>
                      <div style={{ width: 7, height: 7, background: '#111110', flex: 'none', marginTop: 5 }} />
                      <div style={{ width: 1, flex: 1, background: '#E4E4E0' }} />
                    </div>
                    <div style={{ padding: '0 0 20px', minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{ct[1]}</div>
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
                        {ct[2]} · ดูเอกสารต้นฉบับ ↗
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <h2 style={{ fontSize: 15, fontWeight: 600, margin: '36px 0 0' }}>คำถามที่ยังไม่มีคำตอบ</h2>
              <div style={{ marginTop: 14, borderTop: '1px solid #111110' }}>
                {CF.questions.map((cq, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 20,
                      alignItems: 'baseline',
                      padding: '13px 0',
                      borderBottom: '1px solid #EEEEEA',
                    }}
                  >
                    <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{cq[0]}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--accent)', flex: 'none', textAlign: 'right' }}>
                      {cq[1]}
                    </div>
                  </div>
                ))}
              </div>

              <h2 style={{ fontSize: 15, fontWeight: 600, margin: '36px 0 0' }}>บันทึกของผู้ตรวจ</h2>
              <div style={{ marginTop: 14, borderTop: '1px solid #111110' }}>
                {caseNotes.map((cn, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 18,
                      padding: '12px 0',
                      borderBottom: '1px solid #EEEEEA',
                      alignItems: 'baseline',
                    }}
                  >
                    <div style={{ width: 80, flex: 'none', fontSize: 12, color: '#8B8B85' }}>{cn.date}</div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{cn.text}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <input
                  value={caseNote}
                  onChange={(e) => setCaseNote(e.target.value)}
                  placeholder="เพิ่มบันทึก — ถูกลงบันทึกตรวจสอบพร้อมชื่อผู้ตรวจ"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <div
                  onClick={addCaseNote}
                  className="trace24-btn-dark"
                  style={{ padding: '11px 20px', fontSize: 13, flex: 'none' }}
                >
                  บันทึก
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <div>
                <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>คู่กรณีและบุคคลที่เกี่ยวข้อง</h2>
                <div style={{ marginTop: 12, borderTop: '1px solid #111110' }}>
                  {CF.parties.map((cp, i) => (
                    <div key={i} style={{ padding: '11px 0', borderBottom: '1px solid #EEEEEA' }}>
                      <div style={{ fontSize: 13.5 }}>{cp[0]}</div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: cp[2] ? 'var(--accent)' : '#8B8B85',
                          marginTop: 3,
                          lineHeight: 1.5,
                        }}
                      >
                        {cp[1]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>เส้นทางเงิน</h2>
                <div style={{ marginTop: 12, borderTop: '1px solid #111110' }}>
                  {CF.money.map((cm, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom: '1px solid #EEEEEA',
                        alignItems: 'baseline',
                      }}
                    >
                      <div style={{ fontSize: 12.5, color: '#55554F', lineHeight: 1.5 }}>{cm[0]}</div>
                      <div style={{ fontSize: 13, fontWeight: cm[2] ? 600 : 400, flex: 'none' }}>{cm[1]}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>แผนผังหลักฐาน</h2>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                  {CF.evidence.map((ce) => (
                    <span
                      key={ce}
                      className="trace24-chip"
                      style={{
                        fontSize: 11,
                        padding: '4px 9px',
                        border: '1px solid #DDDDD8',
                        color: '#55554F',
                        cursor: 'pointer',
                      }}
                    >
                      {ce} ↗
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 12, lineHeight: 1.6 }}>
                  {CF.signals}
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#8B8B85', lineHeight: 1.55, fontStyle: 'italic' }}>
                คดีนี้เป็นสำนวนภายในสำหรับการตรวจสอบ — ไม่ใช่ข้อกล่าวหาต่อสาธารณะ ทุกการกระทำถูกลงบันทึกตรวจสอบ
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
