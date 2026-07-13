'use client';

import { useMemo } from 'react';
import { REAL_AGENCIES } from '@/lib/agencies';
import { D, useTrace24 } from '@/context/trace24-context';
import { Footer, Logo } from './ui';

const SEARCH_AGENCIES = [...REAL_AGENCIES, ...D.munis];

export function HomeScreen() {
  const {
    query,
    selMuniId,
    setQuery,
    selectMuni,
    clearSel,
    startScan,
    go,
  } = useTrace24();

  const q = query.trim();
  const sel = selMuniId ? SEARCH_AGENCIES.find((m) => m.id === selMuniId) : null;

  const results = useMemo(() => {
    if (sel || q.length < 1) return [];
    const needle = q.toLowerCase();
    return SEARCH_AGENCIES.filter((m) =>
      [m.th, m.en, m.prov, m.dist, m.type, m.tshort, m.web, m.id]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    ).slice(0, 12);
  }, [sel, q]);

  return (
    <div
      data-screen-label="หน้าแรก / ค้นหา"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: 1160,
          width: '100%',
          margin: '0 auto',
          padding: '26px 32px',
          boxSizing: 'border-box',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Logo size={16} />
        <div style={{ display: 'flex', gap: 26, fontSize: 13, color: '#55554F' }}>
          <span onClick={() => go('method')} className="trace24-hover-text" style={{ cursor: 'pointer' }}>ระเบียบวิธี</span>
          <span onClick={() => go('sources')} className="trace24-hover-text" style={{ cursor: 'pointer' }}>แหล่งข้อมูล</span>
          <span onClick={() => go('corrections')} className="trace24-hover-text" style={{ cursor: 'pointer' }}>ขอแก้ไขข้อมูล</span>
          <span onClick={() => go('about')} className="trace24-hover-text" style={{ cursor: 'pointer' }}>เกี่ยวกับเรา</span>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px 72px',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: '.1em', color: '#8B8B85', fontWeight: 500 }}>
          แพลตฟอร์มข้อมูลการใช้จ่ายภาครัฐ — ประเทศไทย
        </div>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 500,
            letterSpacing: '-.01em',
            lineHeight: 1.25,
            margin: '18px 0 12px',
            textAlign: 'center',
            maxWidth: 720,
            textWrap: 'balance',
          }}
        >
          ตามเส้นทางเงิน ค้นหารูปแบบ แสดงหลักฐาน
        </h1>
        <p
          style={{
            margin: '0 0 40px',
            fontSize: 15,
            color: '#55554F',
            textAlign: 'center',
            maxWidth: 560,
            lineHeight: 1.6,
            textWrap: 'pretty',
          }}
        >
          ค้นหาหน่วยงานรัฐที่มีการจัดซื้อจัดจ้าง — เทศบาล อบต. อำเภอ จังหวัด กระทรวง กรม โรงพยาบาล โรงเรียน ตำรวจ ทหาร — เพื่อติดตามว่าเงินสาธารณะถูกวางแผน จัดซื้อจัดจ้าง และตกลงราคาอย่างไร ทุกข้อค้นพบมีเอกสารต้นทางรองรับ
        </p>

        <div style={{ width: '100%', maxWidth: 620, position: 'relative' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (sel) {
                startScan();
                return;
              }
              if (results[0]) selectMuni(results[0].id);
            }}
            placeholder="ค้นหาหน่วยงาน — เช่น เทศบาลตำบลโพทะเล หรือ เทศบาลตำบลป่าไผ่"
            autoComplete="off"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid #111110',
              background: '#fff',
              padding: '16px 18px',
              fontSize: 15.5,
              fontFamily: 'inherit',
              outline: 'none',
              borderRadius: 0,
            }}
          />

          {results.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#fff',
                border: '1px solid #111110',
                borderTop: 'none',
                zIndex: 20,
              }}
            >
              {results.map((r) => (
                <div
                  key={r.id}
                  onClick={() => selectMuni(r.id)}
                  className="trace24-hover-row"
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 12,
                    padding: '13px 18px',
                    borderBottom: '1px solid #EEEEEA',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5 }}>{r.th}</div>
                    <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 2 }}>{r.en}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#55554F', whiteSpace: 'nowrap' }}>
                    {r.tshort} · {r.loc}
                    {'real' in r && r.real ? ' · ข้อมูลจริง' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!sel && q.length >= 2 && results.length === 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#fff',
                border: '1px solid #111110',
                borderTop: 'none',
                padding: '14px 18px',
                fontSize: 13,
                color: '#8B8B85',
                zIndex: 20,
              }}
            >
              ไม่พบหน่วยงานที่ตรงกัน — ระบบครอบคลุมหน่วยงานรัฐที่มีการจัดซื้อจัดจ้างทุกระดับ จับคู่จากชื่อทางการ รหัสหน่วยงาน และการสะกดแบบอื่น ลองระบุจังหวัดหรือประเภทหน่วยงาน
            </div>
          )}

          {sel && (
            <div style={{ border: '1px solid #111110', borderTop: 'none', background: '#fff', padding: '26px 28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 500 }}>{sel.th}</div>
                  <div style={{ fontSize: 13, color: '#55554F', marginTop: 3 }}>{sel.en}</div>
                </div>
                <div
                  onClick={clearSel}
                  className="trace24-hover-text"
                  style={{
                    fontSize: 12,
                    color: '#8B8B85',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    textUnderlineOffset: 2,
                  }}
                >
                  เปลี่ยน
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 18,
                  marginTop: 22,
                  paddingTop: 18,
                  borderTop: '1px solid #EEEEEA',
                }}
              >
                <div><div style={{ fontSize: 11, color: '#8B8B85' }}>ประเภท</div><div style={{ fontSize: 13, marginTop: 4 }}>{sel.type}</div></div>
                <div><div style={{ fontSize: 11, color: '#8B8B85' }}>พื้นที่</div><div style={{ fontSize: 13, marginTop: 4 }}>{sel.loc}</div></div>
                <div><div style={{ fontSize: 11, color: '#8B8B85' }}>รหัสหน่วยงาน</div><div style={{ fontSize: 13, marginTop: 4 }}>{sel.code}</div></div>
                <div><div style={{ fontSize: 11, color: '#8B8B85' }}>เว็บไซต์ทางการ</div><div style={{ fontSize: 13, marginTop: 4 }}>{sel.web} <span style={{ color: '#8B8B85' }}>· ยืนยันแล้ว</span>{'real' in sel && sel.real ? <span style={{ color: '#8A5A1C' }}> · ข้อมูลจริง</span> : null}</div></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 24 }}>
                <div
                  onClick={startScan}
                  className="trace24-btn-dark"
                  style={{ padding: '13px 24px', fontSize: 14 }}
                >
                  วิเคราะห์หน่วยงานนี้
                </div>
                <div style={{ fontSize: 12, color: '#8B8B85', lineHeight: 1.55 }}>
                  ใช้เฉพาะข้อมูลสาธารณะที่เข้าถึงได้โดยชอบด้วยกฎหมาย<br />
                  ไม่ข้ามระบบล็อกอิน · ไม่เก็บข้อมูลส่วนบุคคลเกินจำเป็น
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
