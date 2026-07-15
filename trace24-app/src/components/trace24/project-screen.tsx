'use client';

import { useEffect, useState } from 'react';
import { useTrace24 } from '@/context/trace24-context';
import { REVIEW_OPTIONS, sev } from '@/lib/utils';
import { LoadingHint, RiskDisclaimer, SeverityBadge, selectStyle } from './ui';

type PriceCompareAi = {
  model?: string;
  headline: string;
  marketPosition: string;
  unitRateAnalysis?: string;
  categoryFit: string;
  peerNotes: string;
  caveats: string[];
  documentsToRequest: string[];
  nextSteps: string[];
  disclaimer: string;
  concealmentPresumption?: boolean;
  concealmentPremise?: string;
  dataGaps?: string[];
  evidence?: {
    peerCount?: number;
    peerRule?: string;
    peers?: { id: string; name: string; award: string; pct: string; similarity?: number }[];
    benchmark?: {
      compareMode?: string;
      unitLabel?: string;
      unitRateLabel?: string;
      quantityLabel?: string;
      median?: number;
    };
  };
};

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
  priceBenchmark?: {
    categoryLabel?: string;
    scope?: string;
    n?: number;
    median?: number;
    p25?: number;
    p75?: number;
    vsMedianPct?: number;
    note?: string;
    compareMode?: 'contract' | 'unit';
    unitLabel?: string;
    unitRateLabel?: string;
    quantityLabel?: string;
    unitRate?: number;
    parsed?: {
      pieceCount?: number | null;
      pieceLabel?: string | null;
      capacityKw?: number | null;
    };
  };
};

export function ProjectScreen() {
  const {
    dataset,
    selProjectId,
    projectReview,
    setProjectReview,
    scannedId,
    go,
  } = useTrace24();

  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCompare, setAiCompare] = useState<PriceCompareAi | null>(null);

  const projects = dataset.projects as unknown as Record<string, ProjectLike>;
  const projectKey =
    (selProjectId && projects[selProjectId] ? selProjectId : null) ||
    (dataset.def?.project && projects[dataset.def.project] ? dataset.def.project : null) ||
    Object.keys(projects)[0] ||
    '';
  const pr0 = projectKey ? projects[projectKey] : undefined;

  useEffect(() => {
    setAiCompare(null);
    setAiError(null);
    setAiBusy(false);
  }, [projectKey, scannedId]);

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
  const reviewValue = projectReview[projectKey] || projectReview[selProjectId] || 'ใหม่';
  const alerts = Array.isArray(pr0.alerts) ? pr0.alerts : [];
  const timeline = (Array.isArray(pr0.timeline) ? pr0.timeline : []) as [string, string, string][];
  const related = (Array.isArray(pr0.related) ? pr0.related : []) as [string, string, string][];

  const runAiCompare = () => {
    if (!scannedId || !projectKey) return;
    setAiBusy(true);
    setAiError(null);
    fetch(`/api/agencies/${scannedId}/price-compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: projectKey }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.hint || data.error || `HTTP ${r.status}`);
        return data as PriceCompareAi;
      })
      .then((data) => setAiCompare(data))
      .catch((e: Error) => setAiError(e.message || 'วิเคราะห์ไม่สำเร็จ'))
      .finally(() => setAiBusy(false));
  };

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
        {[
          ['งบประมาณ', pr0.budget || '—'],
          [
            pr0.priceBenchmark?.compareMode === 'unit'
              ? `ค่ากลาง (${pr0.priceBenchmark.unitLabel || 'ต่อหน่วย'})`
              : 'ค่ากลางตลาด',
            pr0.ref || '—',
          ],
          [
            pr0.priceBenchmark?.unitRateLabel ? 'อัตราราคาโครงการ' : 'ราคาที่ตกลง',
            pr0.priceBenchmark?.unitRateLabel || pr0.award || '—',
          ],
        ].map(([label, value]) => (
          <div key={label as string} style={{ padding: '20px 20px 20px 0', borderRight: '1px solid #EEEEEA', marginRight: 20 }}>
            <div style={{ fontSize: 11, color: '#8B8B85' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, marginTop: 8, lineHeight: 1.25 }}>{value}</div>
          </div>
        ))}
        <div style={{ padding: '20px 0' }}>
          <div style={{ fontSize: 11, color: '#8B8B85' }}>
            {pr0.priceBenchmark?.compareMode === 'unit' ? 'เทียบอัตราต่อหน่วย' : 'เทียบค่ากลางตลาด'}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 500,
              marginTop: 8,
              color:
                pr0.priceBenchmark && Math.abs(pr0.priceBenchmark.vsMedianPct || 0) >= 20
                  ? 'var(--accent)'
                  : '#111110',
            }}
          >
            {pr0.pct || '—'}
          </div>
          <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 3, lineHeight: 1.45 }}>
            {pr0.priceBenchmark
              ? `${pr0.priceBenchmark.categoryLabel || 'กลุ่มงาน'}${
                  pr0.priceBenchmark.quantityLabel ? ` · ${pr0.priceBenchmark.quantityLabel}` : ''
                } · n=${pr0.priceBenchmark.n || 0} · ${
                  pr0.priceBenchmark.scope === 'province'
                    ? 'ระดับจังหวัด'
                    : pr0.priceBenchmark.scope === 'national'
                      ? 'ทั้งประเทศ'
                      : 'ในหน่วยงาน'
                } — ไม่ใช่ราคากลางราชการ`
              : 'ยังไม่มีกลุ่มเปรียบเทียบจากแคช'}
          </div>
        </div>
      </div>

      {!!pr0.priceBenchmark?.note && (
        <div
          style={{
            marginTop: 16,
            padding: '12px 14px',
            background: '#F6F6F3',
            fontSize: 12.5,
            color: '#55554F',
            lineHeight: 1.55,
          }}
        >
          {pr0.priceBenchmark.note}
          {pr0.priceBenchmark.compareMode === 'unit' &&
          pr0.priceBenchmark.p25 != null &&
          pr0.priceBenchmark.p75 != null
            ? ` · ช่วง P25–P75 ประมาณ ${Number(pr0.priceBenchmark.p25).toLocaleString('th-TH')} – ${Number(
                pr0.priceBenchmark.p75
              ).toLocaleString('th-TH')} ${pr0.priceBenchmark.unitLabel || ''}`
            : pr0.priceBenchmark.p25 != null && pr0.priceBenchmark.p75 != null
              ? ` · ช่วง P25–P75 ประมาณ ${Number(pr0.priceBenchmark.p25).toLocaleString('th-TH')} – ${Number(
                  pr0.priceBenchmark.p75
                ).toLocaleString('th-TH')} บาท`
              : ''}
          {pr0.priceBenchmark.unitRateLabel && pr0.award
            ? ` · ราคารวมสัญญา ${pr0.award}`
            : ''}
          {pr0.priceBenchmark.compareMode === 'unit' &&
          pr0.priceBenchmark.unitRateLabel &&
          !((pr0.priceBenchmark.n ?? 0) > 0 && (pr0.priceBenchmark.median ?? 0) > 0)
            ? ` · ใช้อัตราต่อหน่วยเป็นหลักแล้ว แต่ยังไม่มีกลุ่มงานคล้ายพอสำหรับค่ากลางต่อหน่วย`
            : ''}
          {pr0.priceBenchmark.compareMode !== 'unit' && !pr0.priceBenchmark.unitRateLabel
            ? ` · ไม่มีปริมาณในชื่องานที่แปลงเป็นอัตราต่อหน่วยได้ — เทียบราคารวมชั่วคราว`
            : ''}
        </div>
      )}

      <div
        style={{
          marginTop: 28,
          borderTop: '1px solid #111110',
          paddingTop: 22,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#8B8B85', fontWeight: 500 }}>
              AI · เปรียบเทียบราคาเชิงรายละเอียด
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '6px 0 0' }}>
              มีอัตราต่อหน่วยแล้วใช้เป็นหลัก · เทียบบาท/ลบ.ม. · บาท/กม. · บาท/ตร.ม.
            </h2>
          </div>
          <button
            type="button"
            onClick={runAiCompare}
            disabled={aiBusy || !scannedId}
            style={{
              fontSize: 13,
              padding: '10px 16px',
              border: '1px solid #111110',
              background: aiBusy ? '#EEEEEA' : '#111110',
              color: aiBusy ? '#55554F' : '#FBFBF9',
              cursor: aiBusy || !scannedId ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {aiBusy ? 'กำลังวิเคราะห์…' : aiCompare ? 'วิเคราะห์อีกครั้ง' : 'ให้ AI วิเคราะห์'}
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: '#8B8B85', marginTop: 8, lineHeight: 1.5, maxWidth: 720 }}>
          เช่น ถนนคอนกรีต — ดึงความยาวแล้วเทียบค่าสร้างต่อกิโลเมตร ไม่ใช่แค่ราคารวมสัญญา · ไม่ใช่ราคากลางราชการ
        </div>
        {aiBusy && <LoadingHint label="AI กำลังอ่านสัญญาและค่ากลางตลาด" style={{ marginTop: 16 }} />}
        {aiError && (
          <div style={{ marginTop: 14, fontSize: 13.5, color: 'var(--accent)', lineHeight: 1.5 }}>{aiError}</div>
        )}
        {aiCompare && (
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 32 }}>
            <div>
              {aiCompare.concealmentPresumption && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: '12px 14px',
                    border: '1px solid #8A5A1C',
                    background: '#FBF6EE',
                    color: '#5C3D12',
                    fontSize: 13.5,
                    lineHeight: 1.55,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>สันนิษฐานปิดบังข้อมูล</div>
                  <div>
                    {aiCompare.concealmentPremise ||
                      'รายละเอียดที่เปิดเผยไม่ครบจนตรวจหรือเปรียบเทียบลำบาก — สันนิษฐานไว้ก่อนว่ามีการปิดบังข้อมูล จนกว่าจะมีเอกสารเติมช่องว่าง (ยังไม่ใช่ข้อกล่าวหา)'}
                  </div>
                  {(aiCompare.dataGaps || []).length > 0 && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                      {aiCompare.dataGaps!.map((g, i) => (
                        <li key={i} style={{ marginBottom: 2 }}>
                          {g}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.4 }}>{aiCompare.headline}</div>
              <div style={{ marginTop: 16, fontSize: 14, color: '#33332E', lineHeight: 1.65 }}>
                {aiCompare.marketPosition}
              </div>
              {!!aiCompare.unitRateAnalysis && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: '#8B8B85' }}>วิเคราะห์อัตราต่อหน่วย</div>
                  <div style={{ fontSize: 13.5, color: '#33332E', marginTop: 4, lineHeight: 1.6 }}>
                    {aiCompare.unitRateAnalysis}
                  </div>
                </div>
              )}
              {!!aiCompare.categoryFit && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: '#8B8B85' }}>ความเหมาะของหมวดงาน</div>
                  <div style={{ fontSize: 13.5, color: '#55554F', marginTop: 4, lineHeight: 1.55 }}>
                    {aiCompare.categoryFit}
                  </div>
                </div>
              )}
              {!!aiCompare.peerNotes && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: '#8B8B85' }}>เทียบงานคล้ายในหน่วยงาน</div>
                  <div style={{ fontSize: 13.5, color: '#55554F', marginTop: 4, lineHeight: 1.55 }}>
                    {aiCompare.peerNotes}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 16, borderTop: '1px solid #EEEEEA', paddingTop: 12 }}>
                <div style={{ fontSize: 11, color: '#8B8B85', marginBottom: 8 }}>
                  Peer งานคล้าย
                  {(aiCompare.evidence?.peers || []).length > 0
                    ? ` (${aiCompare.evidence?.peerCount || 0})`
                    : ''}
                  {aiCompare.evidence?.peerRule ? ` · ${aiCompare.evidence.peerRule}` : ' · similarity > 90%'}
                </div>
                {(aiCompare.evidence?.peers || []).length === 0 ? (
                  <div style={{ fontSize: 13, color: '#8A5A1C', lineHeight: 1.55 }}>
                    ไม่พบงานคล้ายในหน่วยงานนี้ — ไม่ใช้โครงการต่างชนิดในหมวดเดียวกันเป็น peer
                  </div>
                ) : (
                  (aiCompare.evidence?.peers || []).slice(0, 5).map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 120px 56px 48px',
                        gap: 10,
                        fontSize: 12.5,
                        padding: '7px 0',
                        borderBottom: '1px solid #F0F0EC',
                        color: '#55554F',
                      }}
                    >
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div>{p.award}</div>
                      <div>{p.pct}</div>
                      <div style={{ color: '#8B8B85' }}>
                        {typeof p.similarity === 'number' ? `${Math.round(p.similarity * 100)}%` : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              {[
                ['ข้อแม้', aiCompare.caveats],
                ['เอกสารที่ควรขอ', aiCompare.documentsToRequest],
                ['ขั้นตอนถัดไป', aiCompare.nextSteps],
              ].map(([label, items]) => (
                <div key={label as string} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{label as string}</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#55554F', lineHeight: 1.55 }}>
                    {((items as string[]) || []).map((t, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: '#8B8B85', lineHeight: 1.55, borderTop: '1px solid #EEEEEA', paddingTop: 12 }}>
                {aiCompare.disclaimer}
                {aiCompare.model ? ` · โมเดล ${aiCompare.model}` : ''}
              </div>
            </div>
          </div>
        )}
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
              onChange={(e) => setProjectReview(projectKey, e.target.value)}
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
