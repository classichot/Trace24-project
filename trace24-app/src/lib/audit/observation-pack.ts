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

/** Rule-based lead text so every row has why / alternative / verify even without AI. */
function explainForSection(
  section: MoneyObservation['section']
): Pick<MoneyObservation, 'suspicionWhy' | 'innocentAlternative' | 'whatToVerify'> {
  switch (section) {
    case 'ใกล้เพดานงบ':
      return {
        suspicionWhy:
          'ราคาที่ตกลงใกล้เพดานงบ/วงเงินประกาศมาก อาจเป็นสัญญาณว่าประมาณราคาหรือสเปกถูกตั้งให้ชิดเพดาน หรือมีการดึงราคาเข้าใกล้งบโดยไม่สะท้อนต้นทุนจริง',
        innocentAlternative:
          'อาจเป็นงานที่มีราคากลาง/งบประมาณคำนวณไว้พอดี หรือตลาดมีผู้เสนอราคาน้อยจึงตกลงใกล้เพดานโดยสุจริต',
        whatToVerify:
          'ขอราคากลางทางการหรือใบแจ้งปริมาณงาน เทียบสเปกกับของที่ส่งมอบ และดูว่ามีส่วนลด/การแข่งขันจริงหรือไม่',
      };
    case 'ค่ากลางตลาด':
      return {
        suspicionWhy:
          'ราคาเบี่ยงจากค่ากลางตลาดในหมวดงานใกล้เคียง อาจชี้ถึงการตั้งราคาสูงเกินเหตุหรือสเปกที่จำกัดการแข่งขัน (ค่ากลางตลาดไม่ใช่ราคากลางราชการ)',
        innocentAlternative:
          'อาจต่างเพราะคุณภาพ ปริมาณ เงื่อนไขส่งมอบ พื้นที่ห่างไกล หรือช่วงเวลาที่ราคาตลาดผันผวน',
        whatToVerify:
          'เทียบกับงานคล้ายในจังหวัด/ช่วงเวลาเดียวกัน ขอเหตุผลส่วนต่างราคา และเอกสารประมาณราคาประกอบ',
      };
    case 'กระจุกมูลค่าปีงบ':
      return {
        suspicionWhy:
          'มูลค่าหรือจำนวนสัญญาไปกระจุกที่ผู้รับจ้างรายเดียวหรือกลุ่มน้อย อาจลดการแข่งขันและเปิดช่องให้มีการหมุนเวียนงานไม่โปร่งใส',
        innocentAlternative:
          'อาจเป็นผู้รับจ้างที่มีความพร้อมเฉพาะทางในพื้นที่ หรือชนะการแข่งขันตามเกณฑ์โดยชอบ',
        whatToVerify:
          'ตรวจสัดส่วนผู้ชนะรายปี จำนวนผู้เข้าเสนอราคา การหมุนเวียนผู้รับจ้าง และความสัมพันธ์ระหว่างผู้ชนะ',
      };
    case 'เร่งใช้เงินปลายปี':
      return {
        suspicionWhy:
          'การจัดซื้อจัดจ้างกระจุกปลายปีงบอาจเป็นสัญญาณรีบใช้เงิน ลดเวลาแข่งขัน หรือตั้งความเร่งด่วนเกินจริง',
        innocentAlternative:
          'อาจเป็นงานตามฤดูกาล งบจัดสรรล่าช้า หรือเหตุจำเป็นที่เกิดขึ้นจริงช่วงปลายปี',
        whatToVerify:
          'ตรวจแผนใช้จ่าย ความเร่งด่วนในเอกสาร วันที่ประกาศ/ปิดรับ และว่ามีผู้เสนอราคาเพียงพอหรือไม่',
      };
    case 'ซอยสัญญา/แยกงวด':
      return {
        suspicionWhy:
          'สัญญาชื่องานคล้ายกันหรือแยกงวดใกล้เคียงกันอาจเป็นการซอยวงเงินเพื่อเลี่ยงเกณฑ์วิธีจัดหา/เพดานอำนาจอนุมัติ',
        innocentAlternative:
          'อาจแยกตามงวดงานจริง แหล่งงบต่างกัน หรือระยะเวลาส่งมอบที่ไม่สามารถรวมสัญญาได้',
        whatToVerify:
          'รวมมูลค่างานที่คล้ายกัน เทียบวันประกาศ/ผู้ชนะ/สถานที่ และตรวจเหตุผลแยกสัญญาตามระเบียบ',
      };
    case 'วิธีจัดหา':
      return {
        suspicionWhy:
          'การใช้วิธีคัดเลือก/เฉพาะเจาะจงแทนการแข่งขันเปิด อาจจำกัดผู้เข้าเสนอราคาหากเหตุผลตามระเบียบไม่ชัด',
        innocentAlternative:
          'อาจเข้าเหตุจำเป็น เร่งด่วน หรือมีผู้รับจ้างที่เชี่ยวชาญเฉพาะตามที่ระเบียบอนุญาต',
        whatToVerify:
          'ขอหนังสือเหตุผลใช้วิธีนั้น ตรวจเกณฑ์วงเงิน และหลักฐานว่าไม่มีทางใช้วิธีแข่งขันได้',
      };
    default:
      return {
        suspicionWhy:
          'มีสัญญาณด้านมูลค่า/กระบวนการที่ควรใช้เป็นประเด็นตั้งต้นเพื่อขอเอกสารตรวจต่อ ไม่ใช่ข้อสรุปความผิด',
        innocentAlternative:
          'อาจอธิบายได้ด้วยเหตุผลทางเทคนิค งบประมาณ หรือสภาพตลาดเมื่อมีเอกสารครบ',
        whatToVerify:
          'รวบรวมประกาศ TOR สัญญา ใบเสนอราคา และรายงานพิจารณาผลเพื่อยืนยันหรือตัดประเด็น',
      };
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
    const explain = explainForSection(section);
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
      ...explain,
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
      const explain = explainForSection(section);
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
        ...explain,
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
