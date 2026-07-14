'use client';

import { D, useTrace24 } from '@/context/trace24-context';
import { sev } from '@/lib/utils';
import { RiskDisclaimer, SeverityBadge } from './ui';

export function ContractorScreen() {
  const { dataset, selContractorId, go } = useTrace24();

  const contractors = dataset.contractors as typeof D.contractors;
  const coRaw =
    contractors[selContractorId as keyof typeof contractors] ??
    contractors[dataset.def.contractor as keyof typeof contractors];
  const coRawExtra = coRaw as {
    registeredAt?: string | null;
    registeredAtNote?: string;
    registeredAtSourceUrl?: string;
  } | undefined;
  const co = {
    name: coRaw?.name || '—',
    reg: coRaw?.reg || '—',
    address: coRaw?.address || '—',
    contracts: coRaw?.contracts ?? 0,
    total: coRaw?.total || '—',
    shareNum: coRaw?.shareNum || '—',
    cats: coRaw?.cats || '—',
    rows: coRaw?.rows || [],
    risks: coRaw?.risks || [],
    directors: coRaw?.directors || [],
    related: coRaw?.related || [],
    addrFlag: coRaw?.addrFlag || false,
    addrNote: coRaw?.addrNote || 'ยังไม่มีข้อมูลกรรมการ/ที่อยู่จาก DBD — เพิ่มได้ที่แท็บความเชื่อมโยง',
    docs: coRaw?.docs || [],
    registeredAt: coRawExtra?.registeredAt || null,
    registeredAtNote: coRawExtra?.registeredAtNote || '',
    registeredAtSourceUrl: coRawExtra?.registeredAtSourceUrl || '',
  };

  return (
    <div
      data-screen-label="โปรไฟล์ผู้รับจ้าง"
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

      <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#8B8B85', fontWeight: 500, marginTop: 24 }}>
        โปรไฟล์ผู้รับจ้าง
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 500, margin: '10px 0 6px' }}>{co.name}</h1>
      <div style={{ fontSize: 13.5, color: '#55554F' }}>
        เลขทะเบียนนิติบุคคล {co.reg} · {co.address}
      </div>
      {co.registeredAt && (
        <div style={{ fontSize: 13, color: '#55554F', marginTop: 6, lineHeight: 1.5 }}>
          จดทะเบียน/ก่อตั้งประมาณ {co.registeredAt}
          {co.registeredAtNote ? ` · ${co.registeredAtNote}` : ' · จากเว็บ/ข่าว (รอยืนยัน)'}
          {co.registeredAtSourceUrl ? (
            <>
              {' · '}
              <a href={co.registeredAtSourceUrl} target="_blank" rel="noreferrer" style={{ color: '#55554F' }}>
                แหล่งที่มา
              </a>
            </>
          ) : null}
        </div>
      )}

      <div
        className="trace24-responsive-grid-4"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0,
          borderTop: '1px solid #111110',
          borderBottom: '1px solid #E4E4E0',
          marginTop: 28,
        }}
      >
        <div style={{ padding: '20px 20px 20px 0', borderRight: '1px solid #EEEEEA', marginRight: 20 }}>
          <div style={{ fontSize: 11, color: '#8B8B85' }}>สัญญาที่ได้รับ</div>
          <div style={{ fontSize: 26, fontWeight: 500, marginTop: 8 }}>{co.contracts}</div>
        </div>
        <div style={{ padding: '20px 20px 20px 0', borderRight: '1px solid #EEEEEA', marginRight: 20 }}>
          <div style={{ fontSize: 11, color: '#8B8B85' }}>มูลค่ารวม</div>
          <div style={{ fontSize: 26, fontWeight: 500, marginTop: 8 }}>{co.total}</div>
        </div>
        <div style={{ padding: '20px 20px 20px 0', borderRight: '1px solid #EEEEEA', marginRight: 20 }}>
          <div style={{ fontSize: 11, color: '#8B8B85' }}>สัดส่วนของหน่วยงาน</div>
          <div style={{ fontSize: 26, fontWeight: 500, marginTop: 8 }}>{co.shareNum}</div>
        </div>
        <div style={{ padding: '20px 0' }}>
          <div style={{ fontSize: 11, color: '#8B8B85' }}>หมวดงาน</div>
          <div style={{ fontSize: 14, fontWeight: 500, marginTop: 12, lineHeight: 1.5 }}>{co.cats}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 56, marginTop: 40, alignItems: 'start' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>สัญญา</h2>
          <div style={{ marginTop: 14, borderTop: '1px solid #111110' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '104px 1fr 100px 92px 76px',
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
              <div>ปีงบ</div>
            </div>
            {co.rows.map((r, i) => (
              <div
                key={i}
                onClick={r[0] ? () => go('project', { selProjectId: r[0]! }) : undefined}
                className={r[0] ? 'trace24-hover-row' : undefined}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '104px 1fr 100px 92px 76px',
                  gap: 14,
                  padding: '13px 0',
                  borderBottom: '1px solid #EEEEEA',
                  alignItems: 'baseline',
                  cursor: r[0] ? 'pointer' : 'default',
                }}
              >
                <div style={{ fontSize: 12.5, color: '#55554F' }}>{r[1]}</div>
                <div style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[2]}</div>
                <div style={{ fontSize: 13 }}>{r[3]}</div>
                <div style={{ fontSize: 12, color: '#55554F' }}>{r[4]}</div>
                <div style={{ fontSize: 12, color: '#55554F' }}>{r[5]}</div>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '40px 0 0' }}>สัญญาณความเสี่ยง</h2>
          <div style={{ marginTop: 14, borderTop: '1px solid #111110' }}>
            {co.risks.length === 0 && (
              <div style={{ padding: '14px 0', fontSize: 13, color: '#8B8B85' }}>
                ยังไม่มีสัญญาณบนผู้รับจ้างรายนี้
              </div>
            )}
            {co.risks.map((cr, i) => {
              const s = sev(cr.sevKey);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 16,
                    alignItems: 'baseline',
                    padding: '14px 0',
                    borderBottom: '1px solid #EEEEEA',
                  }}
                >
                  <div style={{ width: 140, flex: 'none', fontSize: 11, letterSpacing: '.04em', color: '#8B8B85' }}>
                    {cr.tag}
                  </div>
                  <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.55 }}>{cr.text}</div>
                  <SeverityBadge label={s.sevLabel} color={s.sevColor} border={s.sevBorder} />
                </div>
              );
            })}
          </div>
          <RiskDisclaimer />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          <div>
            <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>กรรมการและผู้ถือหุ้น</h2>
            <div style={{ marginTop: 12, borderTop: '1px solid #111110' }}>
              {co.directors.length === 0 && (
                <div style={{ padding: '12px 0', fontSize: 12.5, color: '#8B8B85', lineHeight: 1.55 }}>
                  ยังไม่มีรายชื่อกรรมการ/ผู้ถือหุ้น — บันทึกจาก DBD หรือ บอจ.5 ที่แท็บ「ความเชื่อมโยง」เพื่อเปิดการตรวจ R13
                </div>
              )}
              {co.directors.map((d, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #EEEEEA' }}>
                  <div style={{ fontSize: 13.5 }}>{d.name}</div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: d.flag ? 'var(--accent)' : '#8B8B85',
                      marginTop: 3,
                      lineHeight: 1.5,
                    }}
                  >
                    {d.note}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>ที่อยู่จดทะเบียน</h2>
            <div style={{ fontSize: 13.5, marginTop: 12, lineHeight: 1.6 }}>{co.address}</div>
            <div style={{ fontSize: 11.5, color: co.addrFlag ? 'var(--accent)' : '#8B8B85', marginTop: 5 }}>
              {co.addrNote}
            </div>
          </div>

          {co.related.length > 0 && (
            <div>
              <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>บริษัทที่อาจเกี่ยวข้องกัน</h2>
              <div style={{ marginTop: 12, borderTop: '1px solid #111110' }}>
                {co.related.map((rel) => (
                  <div
                    key={rel.id}
                    onClick={() => go('contractor', { selContractorId: rel.id })}
                    className="trace24-hover-row"
                    style={{ padding: '12px 0', borderBottom: '1px solid #EEEEEA', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 13.5 }}>{rel.name}</div>
                    <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 4, lineHeight: 1.55 }}>{rel.note}</div>
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
          )}

          <div>
            <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>แหล่งอ้างอิง</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {co.docs.map((cd) => (
                <span
                  key={cd}
                  className="trace24-chip"
                  style={{
                    fontSize: 11.5,
                    padding: '5px 10px',
                    border: '1px solid #DDDDD8',
                    color: '#55554F',
                    cursor: 'pointer',
                  }}
                >
                  {cd} ↗
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 10, lineHeight: 1.55 }}>
              ความสัมพันธ์ระหว่างบริษัทอ้างอิงจากประกาศผู้ชนะและข้อมูลทะเบียนนิติบุคคลสาธารณะเท่านั้น
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
