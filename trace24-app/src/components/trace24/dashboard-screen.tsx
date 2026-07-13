'use client';

import { D, useTrace24 } from '@/context/trace24-context';
import { sev } from '@/lib/utils';
import { RiskDisclaimer, SeverityBadge } from './ui';

export function DashboardScreen() {
  const { muni, dataset, go } = useTrace24();
  const { meta } = dataset;

  return (
    <div
      data-screen-label="แดชบอร์ดหน่วยงาน"
      style={{
        maxWidth: 1160,
        margin: '0 auto',
        padding: '44px 32px 80px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#8B8B85', fontWeight: 500 }}>
            รายงานหน่วยงาน · ปีงบประมาณ 2566–2568
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 500, margin: '10px 0 6px' }}>{muni.th}</h1>
          <div style={{ fontSize: 13.5, color: '#55554F' }}>
            {muni.loc} · {muni.web} · สแกนล่าสุดวันนี้
          </div>
        </div>
        <div style={{ minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#55554F', marginBottom: 6 }}>
            <span>ความครบถ้วนของข้อมูล</span>
            <span>{meta.dataPct}</span>
          </div>
          <div style={{ height: 4, background: '#ECECE8' }}>
            <div
              style={{
                height: 4,
                width: meta.dataPct && meta.dataPct !== '—' ? meta.dataPct : '0%',
                background: '#111110',
              }}
            />
          </div>
          <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 6 }}>{meta.dataGapNote}</div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 0,
          borderTop: '1px solid #111110',
          borderBottom: '1px solid #E4E4E0',
          marginTop: 32,
        }}
      >
        {dataset.stats.map((s) => (
          <div key={s.label} style={{ padding: '22px 20px 22px 0', borderRight: '1px solid #EEEEEA', marginRight: 20 }}>
            <div style={{ fontSize: 11, color: '#8B8B85' }}>{s.label}</div>
            <div style={{ fontSize: 29, fontWeight: 500, marginTop: 8 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 56, marginTop: 44, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>โครงการที่ควรตรวจสอบเป็นอันดับแรก</h2>
            <div style={{ fontSize: 12, color: '#8B8B85' }}>{meta.priorityNote}</div>
          </div>
          <div style={{ marginTop: 16, borderTop: '1px solid #111110' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '104px 1fr 96px 88px 118px',
                gap: 14,
                padding: '10px 0',
                borderBottom: '1px solid #E4E4E0',
                fontSize: 11,
                color: '#8B8B85',
              }}
            >
              <div>โครงการ</div>
              <div>รายละเอียด</div>
              <div>ราคาที่ตกลง</div>
              <div>วิธี</div>
              <div>สัญญาณ</div>
            </div>
            {(dataset.priorityOrder || []).length === 0 && (
              <div style={{ padding: '16px 0', fontSize: 13.5, color: '#8B8B85' }}>
                ยังไม่มีโครงการในรายงานนี้ — หน่วยงานอยู่ในทะเบียน e-GP แล้ว ระบบจะดึงสัญญาจากภาษีไปไหนเมื่อพร้อม
              </div>
            )}
            {(dataset.priorityOrder || []).map((id) => {
              const projects = dataset.projects as typeof D.projects;
              const p = projects[id as keyof typeof projects];
              if (!p) return null;
              const s = sev(p.sevKey);
              return (
                <div
                  key={id}
                  onClick={() => go('project', { selProjectId: id })}
                  className="trace24-hover-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '104px 1fr 96px 88px 118px',
                    gap: 14,
                    padding: '14px 0',
                    borderBottom: '1px solid #EEEEEA',
                    cursor: 'pointer',
                    alignItems: 'baseline',
                  }}
                >
                  <div style={{ fontSize: 12.5, color: '#55554F' }}>{p.code}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 13 }}>{p.award}</div>
                  <div style={{ fontSize: 12, color: '#55554F' }}>{p.methodShort}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13 }}>{p.ind}</span>
                    <SeverityBadge label={s.sevLabel} color={s.sevColor} border={s.sevBorder} />
                  </div>
                </div>
              );
            })}
          </div>
          <RiskDisclaimer />

          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '44px 0 0' }}>{meta.vendorsTitle}</h2>
          <div style={{ marginTop: 16, borderTop: '1px solid #111110' }}>
            {(dataset.topContractors || []).map((c) => (
              <div
                key={c.id}
                onClick={() => go('contractor', { selContractorId: c.id })}
                className="trace24-hover-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 110px 90px',
                  gap: 16,
                  alignItems: 'center',
                  padding: '13px 0',
                  borderBottom: '1px solid #EEEEEA',
                  cursor: 'pointer',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ height: 3, background: '#ECECE8', marginTop: 7, maxWidth: 360 }}>
                    <div style={{ height: 3, background: '#111110', width: ('pct' in c ? c.pct : '40%') as string }} />
                  </div>
                </div>
                <div style={{ fontSize: 13, textAlign: 'right' }}>{c.value}</div>
                <div style={{ fontSize: 12, color: '#8B8B85', textAlign: 'right' }}>{c.n} สัญญา</div>
              </div>
            ))}
            {(dataset.topContractors || []).length === 0 && (
              <div style={{ padding: '14px 0', fontSize: 13, color: '#8B8B85' }}>ยังไม่มีผู้รับจ้างในชุดข้อมูล</div>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#55554F', marginTop: 12 }}>{meta.concNote}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div>
            <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>สัญญาณความเสี่ยงตามหมวด</h2>
            <div style={{ marginTop: 12, borderTop: '1px solid #111110' }}>
              {dataset.riskCats.map((rc) => (
                <div
                  key={rc.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid #EEEEEA',
                  }}
                >
                  <div style={{ fontSize: 13 }}>{rc.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 80, height: 3, background: '#ECECE8' }}>
                      <div style={{ height: 3, background: 'var(--accent)', width: rc.pct }} />
                    </div>
                    <div style={{ fontSize: 13, width: 16, textAlign: 'right' }}>{rc.count}</div>
                  </div>
                </div>
              ))}
              {(dataset.riskCats || []).length === 0 && (
                <div style={{ padding: '12px 0', fontSize: 13, color: '#8B8B85' }}>ยังไม่มีหมวดสัญญาณ — เปิดผู้ช่วยสอบสวนเพื่อคำนวณ</div>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 10 }}>
              แต่ละหมวดแยกจากกัน — ไม่รวมเป็นคะแนนเดียว
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>วิธีจัดซื้อจัดจ้าง</h2>
            <div style={{ marginTop: 12, borderTop: '1px solid #111110' }}>
              {dataset.methods.map((m) => (
                <div key={m.label} style={{ padding: '10px 0', borderBottom: '1px solid #EEEEEA' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{m.label}</span>
                    <span style={{ color: '#55554F' }}>{m.n} · {m.pct}</span>
                  </div>
                  <div style={{ height: 3, background: '#ECECE8', marginTop: 7 }}>
                    <div style={{ height: 3, background: '#111110', width: m.pct }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>มูลค่าจัดซื้อจัดจ้างรายปี</h2>
            <div style={{ marginTop: 12, borderTop: '1px solid #111110' }}>
              {dataset.years.map((y) => (
                <div
                  key={y.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '76px 1fr 76px',
                    gap: 12,
                    alignItems: 'center',
                    padding: '11px 0',
                    borderBottom: '1px solid #EEEEEA',
                  }}
                >
                  <div style={{ fontSize: 13, color: '#55554F' }}>{y.label}</div>
                  <div style={{ height: 3, background: '#ECECE8' }}>
                    <div style={{ height: 3, background: '#111110', width: y.pct }} />
                  </div>
                  <div style={{ fontSize: 13, textAlign: 'right' }}>{y.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
