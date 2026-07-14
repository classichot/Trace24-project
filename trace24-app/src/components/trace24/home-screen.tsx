'use client';

import { useEffect, useState } from 'react';
import { REAL_AGENCIES, type AgencyRecord } from '@/lib/agencies';
import { D, useTrace24 } from '@/context/trace24-context';
import { Footer, Logo, LoadingHint } from './ui';

type SearchHit = AgencyRecord & { cached?: boolean };

export function HomeScreen() {
  const {
    query,
    selMuniId,
    selAgency,
    setQuery,
    selectMuni,
    clearSel,
    startScan,
    go,
  } = useTrace24();

  const q = query.trim();
  const sel =
    selMuniId && selAgency?.id === selMuniId
      ? selAgency
      : selMuniId
        ? REAL_AGENCIES.find((m) => m.id === selMuniId) ||
          (D.munis as AgencyRecord[]).find((m) => m.id === selMuniId) ||
          null
        : null;

  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [catalogCount, setCatalogCount] = useState<number | null>(null);

  useEffect(() => {
    if (sel || q.length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/agencies?q=${encodeURIComponent(q)}&limit=15`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data) => {
          setResults((data.results || []) as SearchHit[]);
          if (data.meta?.count) setCatalogCount(data.meta.count);
        })
        .catch((e: Error) => {
          if (e.name === 'AbortError') return;
          setResults([]);
        })
        .finally(() => setSearching(false));
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [sel, q]);

  useEffect(() => {
    fetch('/api/agencies')
      .then((r) => r.json())
      .then((data) => {
        if (data.meta?.count) setCatalogCount(data.meta.count);
      })
      .catch(() => {});
  }, []);

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
          {catalogCount != null ? ` · ทะเบียนหน่วยจัดซื้อ ${catalogCount.toLocaleString('th-TH')} แห่ง` : ''}
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
          ค้นหาจากทะเบียนหน่วยจัดซื้อ e-GP ทั้งประเทศ — เทศบาล · อำเภอ · จังหวัด · กระทรวง · ทบวง · กรม · โรงเรียนรัฐ · มหาวิทยาลัย · โรงพยาบาลรัฐ — พร้อมรหัสหน่วยงาน
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
              if (results[0]) selectMuni(results[0].id, results[0]);
            }}
            placeholder="ค้นหา — เทศบาล · อำเภอ · จังหวัด · กระทรวง · กรม · โรงเรียน · มหาวิทยาลัย · โรงพยาบาล · หรือรหัสหน่วยงาน"
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
                maxHeight: 360,
                overflowY: 'auto',
              }}
            >
              {results.map((r) => (
                <div
                  key={r.id}
                  onClick={() => selectMuni(r.id, r)}
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
                    <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 2 }}>
                      {r.prov ? `จ.${r.prov}` : 'จังหวัดไม่ทราบ'}
                      {r.dist ? ` · อ.${r.dist}` : ''}
                      {` · รหัส ${r.code}`}
                      {r.en ? ` · ${r.en}` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#55554F', whiteSpace: 'nowrap' }}>
                    {r.tshort}
                    {r.cached || r.real ? ' · มีรายงาน' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!sel && q.length >= 1 && !searching && results.length === 0 && (
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
                color: '#55554F',
                zIndex: 20,
                lineHeight: 1.55,
              }}
            >
              <div style={{ marginBottom: 8 }}>ไม่พบ「{q}」ในทะเบียนหน่วยจัดซื้อ</div>
              <div style={{ color: '#8B8B85', marginBottom: 8 }}>ลองหน่วยงานที่มีรายงานครบ:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {REAL_AGENCIES.map((a) => (
                  <span
                    key={a.id}
                    onClick={() => selectMuni(a.id, a)}
                    style={{
                      fontSize: 12,
                      padding: '5px 9px',
                      border: '1px solid #C9C9C4',
                      cursor: 'pointer',
                    }}
                  >
                    {a.th}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!sel && q.length >= 1 && searching && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#fff',
                border: '1px solid #111110',
                borderTop: 'none',
                padding: '10px 18px',
                zIndex: 20,
              }}
            >
              <LoadingHint label="กำลังค้นหาหน่วยงาน" variant="inline" />
            </div>
          )}

          {sel && (
            <div style={{ border: '1px solid #111110', borderTop: 'none', background: '#fff', padding: '26px 28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 500 }}>{sel.th}</div>
                  <div style={{ fontSize: 13, color: '#55554F', marginTop: 3 }}>
                    {sel.prov ? `จ.${sel.prov}` : 'จังหวัดไม่ทราบ'}
                    {sel.dist ? ` · อ.${sel.dist}` : ''}
                    {sel.en ? ` · ${sel.en}` : ` · รหัส ${sel.code}`}
                  </div>
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
                <div>
                  <div style={{ fontSize: 11, color: '#8B8B85' }}>แหล่ง</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    ทะเบียน e-GP
                    {sel.real ? <span style={{ color: '#8A5A1C' }}> · มีรายงาน</span> : null}
                    {sel.web ? <span style={{ color: '#8B8B85' }}> · {sel.web}</span> : null}
                  </div>
                </div>
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
