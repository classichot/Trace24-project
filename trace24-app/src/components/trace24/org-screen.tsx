'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTrace24 } from '@/context/trace24-context';

type BucketStat = {
  key: string;
  label: string;
  agencyCount: number;
  withCache: number;
  openCases: number;
  highPriority: number;
};

type Overview = {
  generatedAt: string;
  totals: {
    catalogAgencies: number;
    withContractsCache: number;
    casesTotal: number;
    casesOpen: number;
    casesHigh: number;
  };
  statusCounts: Record<string, number>;
  byProvince: BucketStat[];
  byType: BucketStat[];
  provinceFilter: string | null;
};

export function OrgScreen() {
  const { go, setSelCaseId } = useTrace24();
  const [data, setData] = useState<Overview | null>(null);
  const [province, setProvince] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const qs = province.trim() ? `?province=${encodeURIComponent(province.trim())}` : '';
    const res = await fetch(`/api/org/overview${qs}`);
    const json = (await res.json()) as Overview & { error?: string };
    setLoading(false);
    if (!res.ok) {
      setErr(json.error || `HTTP ${res.status}`);
      return;
    }
    setData(json);
  }, [province]);

  useEffect(() => {
    void load();
  }, [load]);

  const t = data?.totals;

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
            EXECUTIVE · จังหวัด / ประเภทหน่วยงาน
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 500, margin: '8px 0 6px' }}>ภาพรวมองค์กร</h1>
          <div style={{ fontSize: 13.5, color: '#55554F' }}>
            ครอบคลุมแคตตาล็อก · แคชสัญญา · สำนวนเปิด — สำหรับหัวหน้าทีมตรวจ
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <input
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            placeholder="กรองจังหวัด เช่น พังงา"
            style={{ fontSize: 13, padding: '9px 12px', border: '1px solid #D8D8D2', minWidth: 180 }}
          />
          <div
            onClick={() => void load()}
            className="trace24-btn-dark"
            style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', userSelect: 'none' }}
          >
            รีเฟรช
          </div>
          <div
            onClick={() => {
              setSelCaseId(null);
              go('cases');
            }}
            style={{
              padding: '9px 14px',
              fontSize: 13,
              border: '1px solid #D8D8D2',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            ไปคิวงาน
          </div>
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--accent)' }}>{err}</div>
      )}
      {loading && !data && (
        <div style={{ marginTop: 24, fontSize: 13.5, color: '#8B8B85' }}>กำลังโหลดภาพรวม…</div>
      )}

      {t && (
        <>
          <div
            style={{
              marginTop: 28,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
            }}
          >
            {[
              ['หน่วยงานในแคตตาล็อก', t.catalogAgencies],
              ['มีแคชสัญญา', t.withContractsCache],
              ['สำนวนทั้งหมด', t.casesTotal],
              ['สำนวนเปิด', t.casesOpen],
              ['ความสำคัญสูง', t.casesHigh],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                style={{
                  padding: '14px 16px',
                  background: '#F6F6F3',
                  borderTop: '2px solid #111110',
                }}
              >
                <div style={{ fontSize: 11.5, color: '#8B8B85' }}>{label}</div>
                <div style={{ fontSize: 26, fontWeight: 560, marginTop: 6 }}>
                  {Number(value).toLocaleString('th-TH')}
                </div>
              </div>
            ))}
          </div>

          {data?.statusCounts && Object.keys(data.statusCounts).length > 0 && (
            <div style={{ marginTop: 18, fontSize: 12.5, color: '#55554F', lineHeight: 1.55 }}>
              สถานะสำนวน:{' '}
              {Object.entries(data.statusCounts)
                .map(([k, v]) => `${k} ${v}`)
                .join(' · ')}
            </div>
          )}

          <div
            style={{
              marginTop: 32,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 32,
            }}
            className="trace24-org-grid"
          >
            <BucketTable
              title="ตามจังหวัด"
              rows={data?.byProvince || []}
              onProvince={(p) => {
                setProvince(p);
              }}
            />
            <BucketTable title="ตามประเภทหน่วยงาน" rows={data?.byType || []} />
          </div>

          <p style={{ marginTop: 28, fontSize: 12, color: '#8B8B85' }}>
            อัปเดต {data?.generatedAt ? new Date(data.generatedAt).toLocaleString('th-TH') : '—'}
            {data?.provinceFilter ? ` · กรอง จ.${data.provinceFilter}` : ''}
            {' · '}คะแนนในระบบเป็นลำดับการตรวจ ไม่ใช่ข้อพิสูจน์ความผิด
          </p>
        </>
      )}

      <style>{`
        @media (max-width: 820px) {
          .trace24-org-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function BucketTable({
  title,
  rows,
  onProvince,
}: {
  title: string;
  rows: BucketStat[];
  onProvince?: (p: string) => void;
}) {
  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>{title}</h2>
      <div style={{ borderTop: '1px solid #E6E6E0' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 0.7fr 0.7fr 0.7fr 0.6fr',
            gap: 6,
            fontSize: 11,
            color: '#8B8B85',
            padding: '8px 0',
            borderBottom: '1px solid #E6E6E0',
          }}
        >
          <div>ชื่อ</div>
          <div>หน่วยงาน</div>
          <div>แคชสัญญา</div>
          <div>สำนวนเปิด</div>
          <div>High</div>
        </div>
        {rows.length === 0 && (
          <div style={{ padding: '14px 0', fontSize: 13, color: '#8B8B85' }}>ไม่มีข้อมูล</div>
        )}
        {rows.map((r) => (
          <div
            key={r.key}
            onClick={() => onProvince?.(r.label)}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 0.7fr 0.7fr 0.7fr 0.6fr',
              gap: 6,
              fontSize: 13,
              padding: '10px 0',
              borderBottom: '1px solid #E6E6E0',
              cursor: onProvince ? 'pointer' : 'default',
            }}
          >
            <div style={{ fontWeight: 520 }}>{r.label}</div>
            <div>{r.agencyCount.toLocaleString('th-TH')}</div>
            <div>{r.withCache.toLocaleString('th-TH')}</div>
            <div>{r.openCases}</div>
            <div style={{ color: r.highPriority ? 'var(--accent)' : undefined }}>{r.highPriority}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
