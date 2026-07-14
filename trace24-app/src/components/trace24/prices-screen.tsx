'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTrace24 } from '@/context/trace24-context';
import { preferredUnitRateKind } from '@/lib/parse-project-quantity';
import { categorizeWork, formatBahtTh, WORK_CATEGORY_DEFS } from '@/lib/work-categories';

function primaryUnitCell(c: CategoryRow) {
  const pref = preferredUnitRateKind(c.id);
  if (pref === 'baht_per_km' && c.perKm) {
    return { label: `${Math.round(c.perKm.median).toLocaleString('th-TH')} บาท/กม.`, n: c.perKm.n };
  }
  if (pref === 'baht_per_m2' && c.perM2) {
    return { label: `${Math.round(c.perM2.median).toLocaleString('th-TH')} บาท/ตร.ม.`, n: c.perM2.n };
  }
  if (pref === 'baht_per_m' && c.perM) {
    return { label: `${Math.round(c.perM.median).toLocaleString('th-TH')} บาท/ม.`, n: c.perM.n };
  }
  if (pref === 'baht_per_kw' && c.perKw) {
    return { label: `${Math.round(c.perKw.median).toLocaleString('th-TH')} บาท/กิโลวัตต์`, n: c.perKw.n };
  }
  if (pref === 'baht_per_piece' && c.perPiece) {
    return { label: `${Math.round(c.perPiece.median).toLocaleString('th-TH')} บาท/หน่วย`, n: c.perPiece.n };
  }
  if (c.perKw) return { label: `${Math.round(c.perKw.median).toLocaleString('th-TH')} บาท/กิโลวัตต์`, n: c.perKw.n };
  if (c.perPiece) return { label: `${Math.round(c.perPiece.median).toLocaleString('th-TH')} บาท/หน่วย`, n: c.perPiece.n };
  if (c.perKm) return { label: `${Math.round(c.perKm.median).toLocaleString('th-TH')} บาท/กม.`, n: c.perKm.n };
  if (c.perM2) return { label: `${Math.round(c.perM2.median).toLocaleString('th-TH')} บาท/ตร.ม.`, n: c.perM2.n };
  if (c.perM) return { label: `${Math.round(c.perM.median).toLocaleString('th-TH')} บาท/ม.`, n: c.perM.n };
  return null;
}
import { Footer, LoadingHint, Logo } from './ui';

type UnitBucket = {
  unitLabel: string;
  n: number;
  median: number;
  p25: number;
  p75: number;
  scope: string;
};

type CategoryRow = {
  id: string;
  label: string;
  n: number;
  median: number;
  p25: number;
  p75: number;
  provinceCount: number;
  perKm?: { n: number; median: number; p25: number; p75: number } | null;
  perM2?: { n: number; median: number; p25: number; p75: number } | null;
  perM?: { n: number; median: number; p25: number; p75: number } | null;
  perPiece?: { n: number; median: number; p25: number; p75: number } | null;
  perKw?: { n: number; median: number; p25: number; p75: number } | null;
};

type Selected = {
  id: string;
  label: string;
  n: number;
  median: number;
  p25: number;
  p75: number;
  provinces: string[];
  provinceStats: null | {
    province: string;
    n: number;
    median: number;
    p25: number;
    p75: number;
  };
  byUnit?: Record<string, UnitBucket>;
};

export function PricesScreen() {
  const { go } = useTrace24();
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('road_concrete');
  const [province, setProvince] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [generatedAt, setGeneratedAt] = useState('');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [inferred, setInferred] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    if (q.trim().length < 4) {
      setInferred(null);
      return;
    }
    const t = setTimeout(() => {
      const cat = categorizeWork(q.trim());
      setInferred(cat);
      setCategoryId(cat.id);
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (categoryId) params.set('category', categoryId);
    if (province) params.set('province', province);

    fetch(`/api/benchmarks/prices?${params}`, { signal: ctrl.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || data.hint || `HTTP ${r.status}`);
        return data;
      })
      .then((data) => {
        setCategories(data.categories || []);
        setSelected(data.selected || null);
        setNote(data.note || '');
        setGeneratedAt(data.generatedAt || '');
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError') return;
        setError(e.message || 'โหลดไม่สำเร็จ');
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [categoryId, province]);

  const active = useMemo(() => {
    if (selected?.provinceStats) {
      return {
        scope: `จังหวัด${selected.provinceStats.province}`,
        n: selected.provinceStats.n,
        median: selected.provinceStats.median,
        p25: selected.provinceStats.p25,
        p75: selected.provinceStats.p75,
      };
    }
    if (selected) {
      return {
        scope: 'ทั้งประเทศ',
        n: selected.n,
        median: selected.median,
        p25: selected.p25,
        p75: selected.p75,
      };
    }
    return null;
  }, [selected]);

  const provinces = selected?.provinces || [];

  return (
    <div
      data-screen-label="ค่ากลางราคางาน"
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}
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
        <Logo onClick={() => go('home', { selMuniId: null, query: '' })} size={16} />
        <div style={{ display: 'flex', gap: 26, fontSize: 13, color: '#55554F' }}>
          <span onClick={() => go('home')} className="trace24-hover-text" style={{ cursor: 'pointer' }}>
            ค้นหาหน่วยงาน
          </span>
          <span style={{ color: '#111110', fontWeight: 500 }}>ค่ากลางราคางาน</span>
          <span onClick={() => go('method')} className="trace24-hover-text" style={{ cursor: 'pointer' }}>
            ระเบียบวิธี
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 1160, width: '100%', margin: '0 auto', padding: '12px 32px 80px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#8B8B85', fontWeight: 500 }}>
          ราคาตลาดจากแคชสัญญา · ไม่ใช่ราคากลางราชการ
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 500, margin: '10px 0 8px' }}>ค่ากลางราคางานแต่ละประเภท</h1>
        <div style={{ fontSize: 14, color: '#55554F', maxWidth: 720, lineHeight: 1.55 }}>
          ตัวเลขในตารางเป็นภาพรวมหมวดหยาบ — การเทียบโครงการจริงใช้เฉพาะงานที่คล้ายกันมากกว่า 80%
          เท่านั้น เพื่อไม่ให้ช่วง P25–P75 กว้างเกินจริง · ไม่ใช่ราคากลางราชการ
        </div>

        <div style={{ marginTop: 28, borderTop: '1px solid #111110', paddingTop: 24 }}>
          <div style={{ fontSize: 12, color: '#8B8B85', marginBottom: 8 }}>พิมพ์ชื่องานเพื่อจับหมวดอัตโนมัติ</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="เช่น ก่อสร้างถนนคอนกรีตเสริมเหล็ก คสล. กว้าง 4 เมตร"
            style={{
              width: '100%',
              maxWidth: 720,
              fontSize: 15,
              padding: '12px 0',
              border: 'none',
              borderBottom: '1px solid #111110',
              outline: 'none',
              background: 'transparent',
              fontFamily: 'inherit',
            }}
          />
          {inferred && q.trim().length >= 4 && (
            <div style={{ fontSize: 12.5, color: '#55554F', marginTop: 8 }}>
              จับหมวด: <span style={{ color: '#111110', fontWeight: 500 }}>{inferred.label}</span>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 280px',
            gap: 48,
            marginTop: 36,
            alignItems: 'start',
          }}
        >
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 90px 120px 140px',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid #E4E4E0',
                fontSize: 11,
                color: '#8B8B85',
              }}
            >
              <div>ประเภทงาน</div>
              <div>จำนวน</div>
              <div>ค่ากลางสัญญา</div>
              <div>ค่ากลางต่อหน่วย</div>
            </div>
            {loading && !categories.length && <LoadingHint label="กำลังโหลดค่ากลางตลาด" style={{ marginTop: 20 }} />}
            {error && (
              <div style={{ marginTop: 18, fontSize: 13.5, color: 'var(--accent)' }}>{error}</div>
            )}
            {categories.map((c) => {
              const activeRow = c.id === categoryId;
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setQ('');
                    setInferred(null);
                    setCategoryId(c.id);
                    setProvince('');
                  }}
                  className="trace24-hover-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 90px 120px 140px',
                    gap: 12,
                    padding: '16px 0',
                    borderBottom: '1px solid #EEEEEA',
                    cursor: 'pointer',
                    background: activeRow ? '#F6F6F3' : 'transparent',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: activeRow ? 600 : 500 }}>{c.label}</div>
                    <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 3 }}>
                      {WORK_CATEGORY_DEFS.find((d) => d.id === c.id)?.hint || '—'}
                    </div>
                  </div>
                  <div style={{ fontSize: 13.5, color: '#55554F' }}>{c.n.toLocaleString('th-TH')}</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{formatBahtTh(c.median)}</div>
                  <div style={{ fontSize: 12.5, color: '#55554F', lineHeight: 1.4 }}>
                    {(() => {
                      const u = primaryUnitCell(c);
                      if (!u) return '—';
                      return (
                        <>
                          {u.label}
                          <br />
                          <span style={{ color: '#8B8B85' }}>n={u.n.toLocaleString('th-TH')}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>รายละเอียดหมวดที่เลือก</h2>
            {loading && <LoadingHint label="อัปเดตตัวเลข" style={{ marginTop: 16 }} />}
            {active && selected && (
              <div style={{ marginTop: 16, borderTop: '1px solid #111110' }}>
                <div style={{ padding: '14px 0', borderBottom: '1px solid #EEEEEA' }}>
                  <div style={{ fontSize: 12, color: '#8B8B85' }}>หมวด</div>
                  <div style={{ fontSize: 16, fontWeight: 500, marginTop: 4 }}>{selected.label}</div>
                </div>
                <div style={{ padding: '14px 0', borderBottom: '1px solid #EEEEEA' }}>
                  <div style={{ fontSize: 12, color: '#8B8B85' }}>ขอบเขต</div>
                  <div style={{ fontSize: 15, marginTop: 4 }}>{active.scope}</div>
                </div>
                <div style={{ padding: '14px 0', borderBottom: '1px solid #EEEEEA' }}>
                  <div style={{ fontSize: 12, color: '#8B8B85' }}>ค่ากลาง (median)</div>
                  <div style={{ fontSize: 28, fontWeight: 500, marginTop: 6 }}>{formatBahtTh(active.median)}</div>
                </div>
                <div style={{ padding: '14px 0', borderBottom: '1px solid #EEEEEA' }}>
                  <div style={{ fontSize: 12, color: '#8B8B85' }}>ช่วงกลาง P25 – P75</div>
                  <div style={{ fontSize: 14.5, marginTop: 6, lineHeight: 1.5 }}>
                    {formatBahtTh(active.p25)}
                    <br />
                    {formatBahtTh(active.p75)}
                  </div>
                </div>
                <div style={{ padding: '14px 0', borderBottom: '1px solid #EEEEEA' }}>
                  <div style={{ fontSize: 12, color: '#8B8B85' }}>จำนวนสัญญาที่ใช้คำนวณ</div>
                  <div style={{ fontSize: 15, marginTop: 4 }}>{active.n.toLocaleString('th-TH')}</div>
                </div>

                {!!selected.byUnit &&
                  (() => {
                    const pref = preferredUnitRateKind(selected.id);
                    const entries = Object.entries(selected.byUnit).sort(([a], [b]) => {
                      if (a === pref) return -1;
                      if (b === pref) return 1;
                      return a.localeCompare(b);
                    });
                    return entries.map(([kind, u]) => (
                      <div key={kind} style={{ padding: '14px 0', borderBottom: '1px solid #EEEEEA' }}>
                        <div style={{ fontSize: 12, color: '#8B8B85' }}>
                          ค่ากลางต่อหน่วย · {u.unitLabel} · {u.scope}
                          {kind === pref ? ' · หลัก' : ''}
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 500, marginTop: 6 }}>
                          {Math.round(u.median).toLocaleString('th-TH')} {u.unitLabel}
                        </div>
                        <div style={{ fontSize: 12.5, color: '#55554F', marginTop: 6, lineHeight: 1.5 }}>
                          P25–P75 {Math.round(u.p25).toLocaleString('th-TH')} –{' '}
                          {Math.round(u.p75).toLocaleString('th-TH')} · n={u.n.toLocaleString('th-TH')}
                        </div>
                      </div>
                    ));
                  })()}

                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 12, color: '#8B8B85', marginBottom: 8 }}>กรองจังหวัด (ถ้ามี)</div>
                  <select
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    style={{
                      width: '100%',
                      fontSize: 13.5,
                      padding: '10px 12px',
                      border: '1px solid #111110',
                      background: '#FBFBF9',
                      fontFamily: 'inherit',
                    }}
                  >
                    <option value="">ทั้งประเทศ</option>
                    {provinces.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  {province && !selected.provinceStats && (
                    <div style={{ fontSize: 12, color: '#8A5A1C', marginTop: 8 }}>
                      จังหวัดนี้มีตัวอย่างน้อยเกินไป — แสดงค่าทั้งประเทศแทน
                    </div>
                  )}
                </div>
              </div>
            )}
            <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 18, lineHeight: 1.6 }}>
              {note || 'ค่ากลางตลาดจากแคชสัญญา — ไม่ใช่ราคากลางราชการ'}
              {generatedAt ? ` · อัปเดต ${new Date(generatedAt).toLocaleDateString('th-TH')}` : ''}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
