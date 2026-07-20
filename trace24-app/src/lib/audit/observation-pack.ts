import 'server-only';

import { contractorDisplayName, projectDisplayLabel } from '@/lib/pipeline/normalize';
import type { PipelineReportLike } from '@/lib/pipeline/types';
import type { AuditObservationPack, MoneyObservation } from './observation-types';

export type { AuditObservationPack, MoneyObservation } from './observation-types';

const DISCLAIMER =
  'ชุดสังเกตการณ์นี้จัดลำดับประเด็นมูลค่าเงินจากข้อมูลจัดซื้อจัดจ้างสาธารณะเพื่อประกอบการตรวจและสอบสวน — ไม่ใช่ข้อสรุปการทุจริตหรือความผิด และไม่ใช่รายงานอย่างเป็นทางการของหน่วยงานที่มีอำนาจ';

function sectionForTag(tag: string): MoneyObservation['section'] | null {
  const t = String(tag || '');
  // Longer / specific codes first so R10 is not mistaken for R1
  if (/^R-?PRICE\b|^R10\b/i.test(t) || /PRICE/i.test(t)) return 'ค่ากลางตลาด';
  if (/^R15\b/i.test(t)) return 'กระจุกมูลค่าปีงบ';
  if (/^R17\b/i.test(t)) return 'เร่งใช้เงินปลายปี';
  if (/^R14\b|^R22\b|^R7\b/i.test(t)) return 'วิธีจัดหา';
  if (/^R6\b/i.test(t)) return 'ซอยสัญญา/แยกงวด';
  if (/^R4\b/i.test(t)) return 'ใกล้เพดานงบ';
  if (/^R1[- ]?FREQ\b|^R1\b/i.test(t) && /FREQ|ความถี่|เกิน\s*5/i.test(t))
    return 'กระจุกมูลค่าปีงบ';
  if (/^R2\b|^R16\b|^R24\b|^R21\b/i.test(t)) return 'อื่นๆ ด้านมูลค่า';
  return null;
}

function suggestedCheck(section: MoneyObservation['section']): string {
  switch (section) {
    case 'ใกล้เพดานงบ':
      return 'ขอใบแจ้งปริมาณงาน/ราคากลางทางการ · เทียบสเปกกับงานที่ส่งมอบ';
    case 'ค่ากลางตลาด':
      return 'เทียบกับค่ากลางหมวดงานและจังหวัด · ขอเหตุผลส่วนต่างราคา';
    case 'กระจุกมูลค่าปีงบ':
      return 'ตรวจสัดส่วนผู้ชนะรายปี · ดูการแข่งขันและการหมุนเวียนผู้รับจ้าง';
    case 'เร่งใช้เงินปลายปี':
      return 'ตรวจแผนใช้จ่ายปลายปีงบ · ความเร่งด่วนจริงหรือการรีบใช้เงิน';
    case 'ซอยสัญญา/แยกงวด':
      return 'รวมงวดที่คล้ายกัน · ตรวจเกณฑ์วงเงินและเหตุแยกสัญญา';
    case 'วิธีจัดหา':
      return 'ตรวจเหตุใช้วิธีคัดเลือก/เฉพาะเจาะจงตามระเบียบ';
    default:
      return 'รวบรวมประกาศ TOR สัญญา และรายงานพิจารณาผลเพื่อตรวจต่อ';
  }
}

function moneyTag(tag: string) {
  return sectionForTag(tag) != null;
}

/** Build money observation pack for oversight / investigation workflows. */
export function buildAuditObservationPack(
  agencyId: string,
  report: PipelineReportLike
): AuditObservationPack {
  const agency = report.agency;
  const contractors = report.contractors;
  const observations: MoneyObservation[] = [];
  let i = 0;

  for (const a of report.alerts || []) {
    const tag = String(a.tag || '');
    const section = sectionForTag(tag);
    if (!section) continue;
    const text = String(a.text || '').trim();
    if (!text) continue;
    observations.push({
      id: `obs-${++i}`,
      section,
      ruleTag: tag.split(/[·•]/)[0]?.trim() || tag,
      severity: String(a.sevKey || 'Medium'),
      projectId: '—',
      projectName: 'ระดับหน่วยงาน',
      winner: '—',
      award: '—',
      budget: '—',
      fy: '—',
      text,
      suggestedCheck: suggestedCheck(section),
    });
  }

  for (const [pid, pr] of Object.entries(report.projects || {})) {
    const alerts = pr.alerts || [];
    const prExtra = pr as { fy?: string; awardN?: number };
    for (const a of alerts) {
      const tag = String(a.tag || '');
      const section = sectionForTag(tag);
      if (!section) continue;
      const text = String(a.explain || a.title || '').trim();
      if (!text) continue;
      observations.push({
        id: `obs-${++i}`,
        section,
        ruleTag: tag.split(/[·•]/)[0]?.trim() || tag,
        severity: String(a.sevKey || 'Medium'),
        projectId: String(pr.code || pid),
        projectName: projectDisplayLabel(pr, { maxName: 72 }),
        winner: contractorDisplayName(pr.winner, contractors),
        award: String(pr.award || '—'),
        budget: String(pr.budget || '—'),
        fy: String(prExtra.fy || '—'),
        text,
        suggestedCheck: suggestedCheck(section),
      });
    }
  }

  const sevRank = (s: string) => (s === 'High' ? 0 : s === 'Medium' ? 1 : 2);
  observations.sort(
    (a, b) =>
      sevRank(a.severity) - sevRank(b.severity) ||
      a.section.localeCompare(b.section, 'th') ||
      a.projectName.localeCompare(b.projectName, 'th')
  );

  const bySection: Record<string, number> = {};
  for (const o of observations) {
    bySection[o.section] = (bySection[o.section] || 0) + 1;
  }

  const topWinners = (report.topContractors || []).slice(0, 8).map((c) => ({
    name: String(c.name || c.id || '—'),
    total: String(c.value || '—'),
    shareHint: c.n != null ? `${c.n} สัญญา` : undefined,
  }));

  const projectCount = Object.keys(report.projects || {}).length;
  let totalAward = 0;
  for (const pr of Object.values(report.projects || {})) {
    const n = (pr as { awardN?: number }).awardN;
    if (typeof n === 'number' && Number.isFinite(n)) totalAward += n;
  }

  const documentRequests = [
    'ประกาศเชิญชวน / เอกสารประกวดราคาฉบับเต็ม',
    'TOR และราคากลาง (ถ้ามี) หรือหลักฐานประมาณราคา',
    'รายงานการพิจารณาผลและใบเสนอราคาทุกราย',
    'สัญญาและเอกสารส่งมอบงานที่เกี่ยวข้อง',
    'เหตุผลใช้วิธีจัดหาที่ไม่ใช่ e-bidding (ถ้ามี)',
  ];

  return {
    generatedAt: new Date().toISOString(),
    agencyId,
    agencyName: agency?.th || agencyId,
    province: String((agency as { prov?: string } | undefined)?.prov || ''),
    agencyType: String(
      (agency as { tshort?: string; type?: string } | undefined)?.tshort ||
        (agency as { type?: string } | undefined)?.type ||
        ''
    ),
    disclaimer: DISCLAIMER,
    summary: {
      projectCount,
      observationCount: observations.length,
      bySection,
      highCount: observations.filter((o) => o.severity === 'High').length,
      totalAwardLabel:
        totalAward > 0
          ? `฿${Math.round(totalAward).toLocaleString('th-TH')}`
          : '—',
    },
    observations,
    topWinners,
    documentRequests,
  };
}

export function isMoneyFocusedAlertTag(tag: string) {
  return moneyTag(tag);
}
