'use client';

import { useMemo } from 'react';
import { useTrace24 } from '@/context/trace24-context';

export function ScanScreen() {
  const { muni, dataset, scanStep, datasetLoading, datasetError, go } = useTrace24();

  const stageCount = dataset.stages.length;
  const stages = useMemo(
    () =>
      dataset.stages.map((st, i) => {
        const done = scanStep > i;
        const active = scanStep === i;
        return {
          label: st[0],
          detail: i === 0 ? `ยืนยัน ${muni.web}` : st[1],
          mark: done ? '✓' : active ? '●' : '○',
          markColor: done ? '#111110' : active ? '#111110' : '#C9C9C4',
          anim: active ? 'pulse 1s infinite' : 'none',
          weight: active ? 600 : 400,
          rowOp: done || active ? '1' : '.4',
          detailOp: done ? '1' : '0',
        };
      }),
    [dataset.stages, muni.web, scanStep]
  );

  const scanDone = !datasetLoading && !datasetError && scanStep >= stageCount;

  return (
    <div
      data-screen-label="ความคืบหน้าการสแกน"
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '72px 32px 96px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#8B8B85', fontWeight: 500 }}>
        กำลังสแกนแหล่งข้อมูลสาธารณะ
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 500, margin: '12px 0 6px' }}>{muni.th}</h1>
      <div style={{ fontSize: 13, color: '#8B8B85' }}>
        {muni.web} · เฉพาะข้อมูลสาธารณะ · บันทึกแหล่งที่มาและเวลาดึงข้อมูลทุกรายการ
      </div>

      <div style={{ marginTop: 40, borderTop: '1px solid #E4E4E0' }}>
        {datasetLoading && (
          <div style={{ padding: '20px 0', fontSize: 14, color: '#55554F' }}>
            กำลังดึงข้อมูลจริงจากแหล่งสาธารณะ…
          </div>
        )}
        {datasetError && (
          <div style={{ padding: '20px 0', fontSize: 14, color: '#8A5A1C' }}>
            {datasetError}
            <div
              onClick={() => go('home')}
              className="trace24-hover-text"
              style={{ marginTop: 12, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
            >
              กลับหน้าแรก
            </div>
          </div>
        )}
        {!datasetLoading && !datasetError && stages.map((st, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 14,
              padding: '12px 0',
              borderBottom: '1px solid #EEEEEA',
              opacity: st.rowOp as unknown as number,
            }}
          >
            <div
              style={{
                width: 14,
                fontSize: 11,
                color: st.markColor,
                animation: st.anim,
              }}
            >
              {st.mark}
            </div>
            <div style={{ flex: 1, fontSize: 14.5, fontWeight: st.weight }}>{st.label}</div>
            <div style={{ fontSize: 13, color: '#8B8B85', opacity: st.detailOp as unknown as number }}>
              {st.detail}
            </div>
          </div>
        ))}
      </div>

      {scanDone && (
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 32, flexWrap: 'wrap' }}>
          <div
            onClick={() => go('dashboard')}
            className="trace24-btn-dark"
            style={{ padding: '13px 24px', fontSize: 14 }}
          >
            ดูรายงานหน่วยงาน →
          </div>
          <div style={{ fontSize: 12.5, color: '#8B8B85' }}>{dataset.meta.scanSummary}</div>
        </div>
      )}
    </div>
  );
}
