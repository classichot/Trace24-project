'use client';

import { useState } from 'react';
import { D, useTrace24 } from '@/context/trace24-context';
import { fetchAuditObservationPack } from '@/lib/audit-ui';
import type { AuditObservationPack } from '@/lib/audit/observation-types';
import { callAgencyLlm } from '@/lib/llm-ui';
import { enrichAlertTitle } from '@/lib/pipeline/normalize';
import { sev } from '@/lib/utils';
import { ObservationPackPanel } from './observation-pack-panel';
import { RiskDisclaimer, SeverityBadge } from './ui';

type DashBrief = {
  headline: string;
  bullets: string[];
  nextSteps: string[];
  caveat: string;
  model?: string;
};

type SignalExplain = {
  why: string;
  evidenceHints: string[];
  falsePositiveNotes: string[];
  missingDocuments: string[];
  followUpQuestions: string[];
  caveat: string;
};

export function DashboardScreen() {
  const { muni, dataset, go, scannedId, setPendingOpenCase } = useTrace24();
  const { meta } = dataset;
  const agencyId = scannedId || muni.id;

  const [briefBusy, setBriefBusy] = useState(false);
  const [brief, setBrief] = useState<DashBrief | null>(null);
  const [briefErr, setBriefErr] = useState<string | null>(null);

  const [explainBusy, setExplainBusy] = useState<string | null>(null);
  const [explains, setExplains] = useState<Record<string, SignalExplain>>({});
  const [explainErr, setExplainErr] = useState<string | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditErr, setAuditErr] = useState<string | null>(null);
  const [auditPack, setAuditPack] = useState<AuditObservationPack | null>(null);

  const runAuditPack = async () => {
    if (!agencyId || auditBusy) return;
    setAuditBusy(true);
    setAuditErr(null);
    const out = await fetchAuditObservationPack(agencyId);
    setAuditBusy(false);
    if (!out.ok) {
      setAuditErr(out.error);
      return;
    }
    setAuditPack(out.pack);
  };

  const runBrief = async () => {
    if (!agencyId || briefBusy) return;
    setBriefBusy(true);
    setBriefErr(null);
    const out = await callAgencyLlm<DashBrief>(agencyId, 'dashboard-brief');
    setBriefBusy(false);
    if (!out.ok) {
      setBriefErr(out.error);
      return;
    }
    setBrief(out.data);
  };

  const runExplain = async (key: string, signal: {
    ruleId?: string;
    title?: string;
    explanation?: string;
    severity?: string;
    matchType?: string;
    projectName?: string;
  }) => {
    if (!agencyId || explainBusy) return;
    setExplainBusy(key);
    setExplainErr(null);
    const out = await callAgencyLlm<SignalExplain>(agencyId, 'explain-signal', { signal });
    setExplainBusy(null);
    if (!out.ok) {
      setExplainErr(out.error);
      return;
    }
    setExplains((prev) => ({ ...prev, [key]: out.data }));
  };

  const signalRows: {
    key: string;
    ruleId: string;
    title: string;
    explanation: string;
    severity?: string;
    matchType?: string;
    projectName?: string;
  }[] = [];

  for (const m of dataset.relatedParty?.matches || []) {
    signalRows.push({
      key: `rel-${m.ruleId}-${m.explanation.slice(0, 40)}`,
      ruleId: m.ruleId,
      title: `${m.ruleId} ความเชื่อมโยง`,
      explanation: m.explanation,
      severity: m.severity,
      matchType: m.matchType,
    });
  }

  const contractors = dataset.contractors as Record<string, { name?: string }> | undefined;
  for (const id of (dataset.priorityOrder || []).slice(0, 6)) {
    const projects = dataset.projects as typeof D.projects;
    const p = projects[id as keyof typeof projects] as (typeof D.projects)[keyof typeof D.projects] & {
      winner?: string | null;
      code?: string;
      name?: string;
      alerts?: { tag?: string; title?: string; explain?: string; sevKey?: string }[];
    };
    if (!p?.alerts) continue;
    for (const a of p.alerts.slice(0, 2)) {
      const alert = a;
      const title =
        enrichAlertTitle(alert.title, p, contractors) || alert.tag || 'สัญญาณ';
      signalRows.push({
        key: `p-${id}-${alert.tag || alert.title}`,
        ruleId: alert.tag || 'R?',
        title,
        explanation: alert.explain || title,
        severity: alert.sevKey,
        projectName: p.name,
      });
    }
  }

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
        <div style={{ minWidth: 200, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
          <div>
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
          <div
            onClick={() => void runBrief()}
            className="trace24-btn-dark"
            style={{
              padding: '11px 16px',
              fontSize: 13,
              textAlign: 'center',
              cursor: briefBusy ? 'wait' : 'pointer',
              opacity: briefBusy ? 0.7 : 1,
              userSelect: 'none',
            }}
          >
            {briefBusy ? 'กำลังสรุป…' : 'AI สรุป 30 วินาที'}
          </div>
          {agencyId ? (
            <div
              onClick={() => void runAuditPack()}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                textAlign: 'center',
                cursor: auditBusy ? 'wait' : 'pointer',
                userSelect: 'none',
                border: '1px solid #D8D8D2',
                opacity: auditBusy ? 0.7 : 1,
              }}
              title="สร้างสรุปประเด็นบนเว็บ + AI อธิบาย — ส่งออก PDF / ข้อความ / Word ได้หลังแสดงผล"
            >
              {auditBusy ? 'AI กำลังอธิบาย…' : 'สรุปประเด็นตั้งต้นเพื่อพิจารณาสืบสวน'}
            </div>
          ) : null}
          <div
            onClick={() => {
              setPendingOpenCase(true);
              go('cases');
            }}
            style={{
              padding: '10px 16px',
              fontSize: 13,
              textAlign: 'center',
              cursor: 'pointer',
              userSelect: 'none',
              border: '1px solid #111110',
            }}
            title="เปิดสำนวนใหม่ของหน่วยงานนี้ในคิวงาน"
          >
            เปิดสำนวน / คิวงาน
          </div>
          {auditErr && (
            <div style={{ fontSize: 12, color: 'var(--accent)', textAlign: 'center' }}>{auditErr}</div>
          )}
        </div>
      </div>

      {auditPack && (
        <ObservationPackPanel pack={auditPack} onClose={() => setAuditPack(null)} />
      )}

      {(brief || briefErr) && (
        <div
          style={{
            marginTop: 24,
            padding: '18px 20px',
            background: '#F6F6F3',
            borderTop: '2px solid #111110',
          }}
        >
          {briefErr && <div style={{ fontSize: 13, color: 'var(--accent)' }}>{briefErr}</div>}
          {brief && (
            <>
              <div style={{ fontSize: 11, letterSpacing: '.06em', color: '#8B8B85', marginBottom: 8 }}>
                สรุปด้วย AI{brief.model ? ` · ${brief.model}` : ''} · ไม่เปลี่ยนคะแนนความเสี่ยง
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.45 }}>{brief.headline}</div>
              <div style={{ marginTop: 12 }}>
                {brief.bullets.map((b) => (
                  <div key={b} style={{ fontSize: 13.5, lineHeight: 1.55, color: '#33332E', marginTop: 4 }}>
                    · {b}
                  </div>
                ))}
              </div>
              {brief.nextSteps.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: '#8B8B85', marginBottom: 4 }}>ขั้นถัดไป</div>
                  {brief.nextSteps.map((s) => (
                    <div key={s} style={{ fontSize: 13, lineHeight: 1.5, color: '#55554F' }}>
                      → {s}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 12, fontSize: 12, color: '#8A5A1C' }}>{brief.caveat}</div>
            </>
          )}
        </div>
      )}

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

      {!!dataset.relatedParty?.coverage && (
        <div
          style={{
            marginTop: 28,
            padding: '16px 18px',
            background: '#F6F6F3',
            fontSize: 13.5,
            lineHeight: 1.55,
            color: '#33332E',
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: '.06em', color: '#8B8B85', marginBottom: 6 }}>
            ความเชื่อมโยงผู้บริหาร ↔ กรรมการ/ผู้ถือหุ้น (R13 / R5)
          </div>
          {dataset.relatedParty.coverage}
          {(dataset.relatedParty.matches || []).slice(0, 3).map((m) => (
            <div key={m.explanation} style={{ marginTop: 8, fontSize: 12.5, color: '#55554F' }}>
              · [{m.ruleId}
              {m.matchType === 'surname' ? ' · นามสกุล=lead' : m.matchType === 'full_name' ? ' · ชื่อเต็ม' : ''}
              ] {m.explanation}
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 12, color: '#8A5A1C' }}>
            นามสกุลร่วม = lead ให้สอบสวนเท่านั้น · ไม่ใช่ข้อพิสูจน์เครือญาติ/ทุจริต · ชื่อเต็มยกระดับความมั่นใจ ·
            จัดการที่ Admin → ความเชื่อมโยง
          </div>
        </div>
      )}

      {signalRows.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>AI อธิบายสัญญาณ</h2>
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#8B8B85', lineHeight: 1.5 }}>
            คลิกเพื่อให้อธิบายว่าทำไมขึ้น · อะไรที่ยังขาด · false positive ที่เป็นไปได้
          </p>
          {explainErr && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--accent)' }}>{explainErr}</div>
          )}
          <div style={{ marginTop: 14, borderTop: '1px solid #111110' }}>
            {signalRows.slice(0, 8).map((row) => {
              const ex = explains[row.key];
              return (
                <div key={row.key} style={{ padding: '14px 0', borderBottom: '1px solid #EEEEEA' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                        [{row.ruleId}] {row.title}
                      </div>
                      <div style={{ fontSize: 12.5, color: '#55554F', marginTop: 4, lineHeight: 1.5 }}>
                        {row.explanation}
                        {row.projectName ? ` · ${row.projectName}` : ''}
                      </div>
                    </div>
                    <div
                      onClick={() => void runExplain(row.key, row)}
                      className="trace24-btn-outline"
                      style={{
                        border: '1px solid #111110',
                        padding: '8px 12px',
                        fontSize: 12,
                        flex: 'none',
                        cursor: explainBusy === row.key ? 'wait' : 'pointer',
                        opacity: explainBusy === row.key ? 0.7 : 1,
                        userSelect: 'none',
                      }}
                    >
                      {explainBusy === row.key ? '…' : ex ? 'อธิบายอีกครั้ง' : 'AI อธิบาย'}
                    </div>
                  </div>
                  {ex && (
                    <div style={{ marginTop: 12, padding: '12px 14px', background: '#F6F6F3', fontSize: 12.5, lineHeight: 1.55 }}>
                      <div>{ex.why}</div>
                      {ex.evidenceHints.length > 0 && (
                        <div style={{ marginTop: 8, color: '#55554F' }}>
                          หลักฐาน: {ex.evidenceHints.join(' · ')}
                        </div>
                      )}
                      {ex.falsePositiveNotes.length > 0 && (
                        <div style={{ marginTop: 6, color: '#55554F' }}>
                          อาจไม่ผิดปกติ: {ex.falsePositiveNotes.join(' · ')}
                        </div>
                      )}
                      {ex.missingDocuments.length > 0 && (
                        <div style={{ marginTop: 6, color: '#55554F' }}>
                          เอกสารที่ควรขอ: {ex.missingDocuments.join(' · ')}
                        </div>
                      )}
                      {ex.followUpQuestions.length > 0 && (
                        <div style={{ marginTop: 6, color: '#55554F' }}>
                          {ex.followUpQuestions.map((q) => (
                            <div key={q}>? {q}</div>
                          ))}
                        </div>
                      )}
                      <div style={{ marginTop: 8, color: '#8A5A1C', fontSize: 12 }}>{ex.caveat}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                gridTemplateColumns: '96px 1fr minmax(120px, 0.9fr) 88px 80px 110px',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid #E4E4E0',
                fontSize: 11,
                color: '#8B8B85',
              }}
            >
              <div>โครงการ</div>
              <div>รายละเอียด</div>
              <div>ผู้ชนะการประมูล</div>
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
              const p = projects[id as keyof typeof projects] as (typeof D.projects)[keyof typeof D.projects] & {
                winner?: string | null;
              };
              if (!p) return null;
              const s = sev(p.sevKey);
              const winnerKey = (p.winner || '').trim();
              const contractors = dataset.contractors as Record<string, { name?: string }> | undefined;
              const winnerName =
                (winnerKey && contractors?.[winnerKey]?.name) ||
                (winnerKey && !/^c\d+$/i.test(winnerKey) ? winnerKey : '') ||
                '—';
              return (
                <div
                  key={id}
                  onClick={() => go('project', { selProjectId: id })}
                  className="trace24-hover-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '96px 1fr minmax(120px, 0.9fr) 88px 80px 110px',
                    gap: 12,
                    padding: '14px 0',
                    borderBottom: '1px solid #EEEEEA',
                    cursor: 'pointer',
                    alignItems: 'baseline',
                  }}
                >
                  <div style={{ fontSize: 12.5, color: '#55554F' }}>{p.code}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: '#33332E',
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={winnerName}
                  >
                    {winnerName}
                  </div>
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
              {(dataset.riskCats || []).map((rc) => (
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
