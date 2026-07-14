/**
 * Catalog rules R2, R4, R7, R9, R10, R11, R12 — runnable from contracts-cache fields.
 * (No bidder lists / full TOR text available → R2/R9 use measurable proxies.)
 */
import { titleStem, tokenSimilarity } from '@/lib/title-similarity';

export type CatalogAlert = {
  tag: string;
  title: string;
  sevKey: 'High' | 'Medium' | 'Low';
  conf: string;
  facts: string[][];
  explain: string;
  innocent: string;
  evidence: string[];
};

export type CatalogProject = {
  id: string;
  name: string;
  code?: string;
  winner?: string | null;
  fy?: string;
  method?: string;
  awardN?: number;
  budgetN?: number;
  announced?: string;
  sourceUrl?: string | null;
  workCategoryId?: string;
  priceBenchmark?: {
    p75?: number;
    median?: number;
    vsMedianPct?: number;
    compareMode?: string;
    unitLabel?: string;
    scope?: string;
    n?: number;
  } | null;
};

export type CatalogContractor = {
  id: string;
  name: string;
  contracts: number;
  totalN: number;
  reg?: string;
};

function fyKey(fy?: string): string {
  return String(fy || '').match(/(\d{4})/)?.[1] || '';
}

function announceYear(announced?: string): string {
  const s = String(announced || '');
  const m = s.match(/(25\d{2}|20\d{2})/);
  return m?.[1] || '';
}

function formatBaht(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' บาท';
}

const THRESHOLDS = [
  { t: 500_000, label: '5 แสนบาท' },
  { t: 2_000_000, label: '2 ล้านบาท' },
  { t: 5_000_000, label: '5 ล้านบาท' },
];

export type CatalogRuleResult = {
  projectAlerts: Map<string, CatalogAlert[]>;
  contractorRisks: Map<string, { tag: string; text: string; sevKey: string }[]>;
};

function pushAlert(map: Map<string, CatalogAlert[]>, id: string, alert: CatalogAlert) {
  if (!map.has(id)) map.set(id, []);
  const list = map.get(id)!;
  if (list.some((a) => a.tag === alert.tag && a.title === alert.title)) return;
  list.push(alert);
}

function pushCoRisk(
  map: Map<string, { tag: string; text: string; sevKey: string }[]>,
  id: string,
  risk: { tag: string; text: string; sevKey: string }
) {
  if (!map.has(id)) map.set(id, []);
  const list = map.get(id)!;
  if (list.some((r) => r.tag === risk.tag && r.text === risk.text)) return;
  list.push(risk);
}

/** Apply R2/R4/R7/R9/R10/R11/R12 from available contract fields. */
export function detectCatalogRules(
  projects: CatalogProject[],
  contractors: CatalogContractor[]
): CatalogRuleResult {
  const projectAlerts = new Map<string, CatalogAlert[]>();
  const contractorRisks = new Map<string, { tag: string; text: string; sevKey: string }[]>();
  if (projects.length < 3) return { projectAlerts, contractorRisks };

  const totalValue = contractors.reduce((s, c) => s + (c.totalN || 0), 0) || 1;
  const totalContracts = contractors.reduce((s, c) => s + (c.contracts || 0), 0) || 1;

  // —— R2: value / contract concentration (proxy for few competitors) ——
  const ranked = [...contractors].sort((a, b) => (b.totalN || 0) - (a.totalN || 0));
  const top = ranked[0];
  if (top && (top.contracts >= 3 || top.totalN >= 1_000_000)) {
    const valueShare = (top.totalN || 0) / totalValue;
    const countShare = (top.contracts || 0) / totalContracts;
    if (valueShare >= 0.35 || countShare >= 0.4) {
      const sev = valueShare >= 0.5 || countShare >= 0.55 ? 'High' : 'Medium';
      const alert: CatalogAlert = {
        tag: 'R2 · การแข่งขัน',
        title: `ความกระจุกตัวของผู้รับจ้างสูง (${top.name} ~${Math.round(valueShare * 100)}% มูลค่า)`,
        sevKey: sev,
        conf: `valueShare=${valueShare.toFixed(2)} · countShare=${countShare.toFixed(2)}`,
        facts: [
          ['ผู้รับจ้างอันดับ 1', top.name],
          ['สัดส่วนมูลค่า', `${Math.round(valueShare * 1000) / 10}%`],
          ['สัดส่วนจำนวนสัญญา', `${Math.round(countShare * 1000) / 10}%`],
          ['จำนวนสัญญา', String(top.contracts)],
        ],
        explain:
          'ผู้รับจ้างรายเดียวถือครองสัดส่วนสูงของมูลค่าหรือจำนวนสัญญาในหน่วยงาน — proxy ของตลาดแข่งขันแคบ (ชุดข้อมูลนี้ยังไม่มีรายชื่อผู้เสนอราคาครบ)',
        innocent: 'พื้นที่ห่างไกลอาจมีผู้รับเหมาคุณสมบัติจำกัด — ไม่ใช่ข้อกล่าวหาโดยลำพัง',
        evidence: ['contracts-cache · supplier concentration · R2'],
      };
      for (const p of projects) {
        if (p.winner === top.id) pushAlert(projectAlerts, p.id, alert);
      }
      pushCoRisk(contractorRisks, top.id, {
        tag: 'R2 · การแข่งขัน',
        text: `กระจุกตัว ~${Math.round(valueShare * 100)}% มูลค่า · ${top.contracts} สัญญา ในหน่วยงานนี้`,
        sevKey: sev,
      });
    }
  }

  // —— R4: award extremely close to budget (proxy for ใกล้ราคากลาง/เพดาน) ——
  for (const p of projects) {
    const award = p.awardN || 0;
    const budget = p.budgetN || 0;
    if (award < 10_000 || budget < 10_000) continue;
    const ratio = award / budget;
    if (ratio >= 0.98 && ratio <= 1.02) {
      pushAlert(projectAlerts, p.id, {
        tag: 'R4 · ราคา',
        title: `ราคาที่ตกลงใกล้เพดานงบประมาณมาก (${(ratio * 100).toFixed(1)}%)`,
        sevKey: ratio >= 0.995 ? 'High' : 'Medium',
        conf: `award/budget=${ratio.toFixed(4)}`,
        facts: [
          ['ราคาที่ตกลง', formatBaht(award)],
          ['งบประมาณในชุดข้อมูล', formatBaht(budget)],
          ['สัดส่วน', `${(ratio * 100).toFixed(2)}%`],
        ],
        explain:
          'ราคาที่ตกลงใกล้จำนวนงบประมาณในระเบียนมาก — ใช้เป็น proxy ของการชิดเพดาน/ราคากลาง (ชุดนี้มักไม่มีราคากลางราชการแยก)',
        innocent: 'งานที่ประมาณการตรงกับงบอาจตกลงใกล้เพดานได้ตามจริง',
        evidence: ['contracts-cache · award vs budget · R4'],
      });
    }
  }

  // —— R7: cluster just under common procurement thresholds ——
  for (const { t, label } of THRESHOLDS) {
    const lo = t * 0.85;
    const band = projects.filter((p) => {
      const a = p.awardN || 0;
      return a > lo && a <= t;
    });
    if (band.length < 3) continue;
    const byFy = new Map<string, CatalogProject[]>();
    for (const p of band) {
      const fy = fyKey(p.fy) || 'all';
      if (!byFy.has(fy)) byFy.set(fy, []);
      byFy.get(fy)!.push(p);
    }
    for (const [fy, list] of byFy) {
      if (list.length < 3) continue;
      const sev = list.length >= 5 ? 'High' : 'Medium';
      for (const p of list) {
        pushAlert(projectAlerts, p.id, {
          tag: 'R7 · กระบวนการ',
          title: `ราคาตกลงกระจุกใต้เกณฑ์ ${label} (${list.length} สัญญาใกล้เพดาน)`,
          sevKey: sev,
          conf: `band=${formatBaht(lo)}–${formatBaht(t)} · n=${list.length}`,
          facts: [
            ['เกณฑ์อ้างอิง', label],
            ['จำนวนในแถบราคา', String(list.length)],
            ['ปีงบ', fy],
            ['ราคาที่ตกลง', formatBaht(p.awardN || 0)],
          ],
          explain:
            'หลายสัญญามีราคาตกลงอยู่ในแถบเพิ่งใต้เกณฑ์วงเงินที่ใช้กันบ่อย — รูปแบบที่พบบ่อยเมื่อจัดงานให้ต่ำกว่าเกณฑ์วิธีจัดซื้อ',
          innocent: 'วงเงินจริงของงานเล็กอาจอยู่ใต้เกณฑ์ตามแผนปกติ',
          evidence: ['contracts-cache · threshold banding · R7'],
        });
      }
    }
  }

  // —— R9: near-duplicate titles (TOR/title template proxy; no TOR body in cache) ——
  const stemGroups = new Map<string, CatalogProject[]>();
  for (const p of projects) {
    const stem = titleStem(p.name || '');
    if (stem.length < 12) continue;
    // merge similar stems
    let key = stem;
    for (const k of stemGroups.keys()) {
      if (tokenSimilarity(stem, k) > 0.8) {
        key = k;
        break;
      }
    }
    if (!stemGroups.has(key)) stemGroups.set(key, []);
    stemGroups.get(key)!.push(p);
  }
  for (const [, group] of stemGroups) {
    if (group.length < 3) continue;
    const winners = new Set(group.map((g) => g.winner).filter(Boolean));
    // R6 covers same-winner splits; R9 emphasizes copy-paste wording (incl. multi-winner)
    if (winners.size < 1) continue;
    const sev = group.length >= 5 ? 'High' : 'Medium';
    for (const p of group) {
      pushAlert(projectAlerts, p.id, {
        tag: 'R9 · กระบวนการ',
        title: `คำบรรยาย/ชื่อโครงการซ้ำแบบแม่แบบ (${group.length} รายการ)`,
        sevKey: sev,
        conf: `n=${group.length} · winners=${winners.size}`,
        facts: [
          ['จำนวนชื่อคล้ายสูง', String(group.length)],
          ['จำนวนผู้ชนะในกลุ่ม', String(winners.size)],
          ['ตัวอย่างชื่องาน', (p.name || '').slice(0, 80)],
        ],
        explain:
          'ชื่อโครงการคล้ายกันสูงผิดปกติ — ใช้เป็น proxy ของการคัดลอกคำบรรยาย/TOR (แคชสัญญายังไม่มีข้อความ TOR เต็ม)',
        innocent: 'หน่วยงานอาจใช้แม่แบบชื่อมาตรฐานสำหรับงานประเภทเดียวกัน',
        evidence: ['contracts-cache · title-stem · R9'],
      });
    }
  }

  // —— R10: award above market P75 (peer/national benchmark) ——
  for (const p of projects) {
    const bm = p.priceBenchmark;
    const award = p.awardN || 0;
    if (!bm?.p75 || !award) continue;
    // contract-mode compare: award vs p75; unit-mode already encoded in vsMedian — use award > p75 when compareMode contract
    // For unit mode, unitRate is stored as vsMedian against median; approximate with vsMedianPct >= 35 and note p75
    if (bm.compareMode === 'unit') {
      if (typeof bm.vsMedianPct === 'number' && bm.vsMedianPct >= 35 && (bm.n || 0) >= 5) {
        pushAlert(projectAlerts, p.id, {
          tag: 'R10 · ราคา',
          title: `อัตราราคาสูงกว่าค่ากลางตลาดมาก (+${bm.vsMedianPct.toFixed(1)}%)`,
          sevKey: bm.vsMedianPct >= 50 ? 'High' : 'Medium',
          conf: `vsMedian=${bm.vsMedianPct.toFixed(1)}% · n=${bm.n} · ${bm.scope || ''}`,
          facts: [
            ['เทียบค่ากลาง', `+${bm.vsMedianPct.toFixed(1)}%`],
            ['ขอบเขต', bm.scope || '—'],
            ['หน่วย', bm.unitLabel || '—'],
          ],
          explain: 'อัตราต่อหน่วยสูงกว่าค่ากลางกลุ่มเปรียบเทียบชัดเจน — สัญญาณราคาสูงกว่าตลาดอ้างอิง',
          innocent: 'สเปก/ทำเล/ปริมาณจริงอาจต่างจากกลุ่มเปรียบเทียบ',
          evidence: ['price-benchmark · R10'],
        });
      }
      continue;
    }
    if (award > bm.p75 && (bm.n || 0) >= 5) {
      const over = ((award - bm.p75) / bm.p75) * 100;
      if (over < 5) continue;
      pushAlert(projectAlerts, p.id, {
        tag: 'R10 · ราคา',
        title: `ราคาที่ตกลงสูงกว่า P75 ของกลุ่มเปรียบเทียบ (+${over.toFixed(1)}%)`,
        sevKey: over >= 25 ? 'High' : 'Medium',
        conf: `p75=${Math.round(bm.p75)} · n=${bm.n}`,
        facts: [
          ['ราคาที่ตกลง', formatBaht(award)],
          ['P75 กลุ่มเทียบ', formatBaht(bm.p75)],
          ['ค่ากลาง (median)', formatBaht(bm.median || 0)],
          ['ขอบเขต', bm.scope || '—'],
        ],
        explain: 'ราคาสูงกว่าช่วงกลางบน (P75) ของกลุ่มงานเทียบเคียงในแคช — ไม่ใช่ราคากลางราชการ',
        innocent: 'ขนาดงานหรือสเปกอาจอยู่นอกกลุ่มเปรียบเทียบ',
        evidence: ['price-benchmark · P75 · R10'],
      });
    }
  }

  // —— R11: missing disclosable fields per project ——
  for (const p of projects) {
    const gaps: string[] = [];
    if (!p.sourceUrl) gaps.push('ไม่มี URL ประกาศ/เอกสารต้นทาง');
    if (!p.budgetN || p.budgetN <= 0) gaps.push('ไม่มีวงเงินงบประมาณในระเบียน');
    if (p.winner) {
      const co = contractors.find((c) => c.id === p.winner);
      if (co && (!co.reg || co.reg === '—')) gaps.push('ไม่มีเลขทะเบียนนิติบุคคลผู้ชนะ');
    } else {
      gaps.push('ไม่ระบุผู้ชนะ');
    }
    if (gaps.length < 2) continue;
    pushAlert(projectAlerts, p.id, {
      tag: 'R11 · การเปิดเผยข้อมูล',
      title: `เอกสาร/ฟิลด์ที่ควรเปิดเผยยังไม่ครบ (${gaps.length} จุด)`,
      sevKey: gaps.length >= 3 ? 'High' : 'Medium',
      conf: `gaps=${gaps.length}`,
      facts: gaps.map((g, i) => [`ช่องว่าง ${i + 1}`, g]),
      explain: 'ขาดลิงก์เอกสารหรือฟิลด์สำคัญที่ใช้ตรวจสอบได้จากข้อมูลสาธารณะในแคช',
      innocent: 'บางระเบียนต้นทางอาจไม่เผยแพร่ครบในชุดที่ดึงมา',
      evidence: ['contracts-cache · field coverage · R11'],
    });
  }

  // —— R12: internal contradictions (award > budget, FY vs announce year) ——
  for (const p of projects) {
    const issues: string[][] = [];
    const award = p.awardN || 0;
    const budget = p.budgetN || 0;
    if (award > 0 && budget > 0 && award > budget * 1.05) {
      issues.push(['ราคา vs งบ', `ตกลง ${formatBaht(award)} สูงกว่างบ ${formatBaht(budget)}`]);
    }
    const fy = fyKey(p.fy);
    const ay = announceYear(p.announced);
    if (fy && ay) {
      const fyNum = Number(fy);
      const ayNum = Number(ay);
      // Buddhist vs Gregorian rough: 2566 vs 2023
      const ayBuddhist = ayNum >= 2400 ? ayNum : ayNum + 543;
      if (Math.abs(fyNum - ayBuddhist) >= 2 && Math.abs(fyNum - ayNum) >= 2) {
        issues.push(['ปีงบ vs วันที่ประกาศ', `ปีงบ ${fy} · วันที่ในระเบียน ${p.announced}`]);
      }
    }
    if (!issues.length) continue;
    pushAlert(projectAlerts, p.id, {
      tag: 'R12 · คุณภาพข้อมูล',
      title: 'ตัวเลขหรือวันที่ในระเบียนขัดแย้งกัน',
      sevKey: issues.some((i) => i[0].includes('ราคา')) ? 'Medium' : 'Low',
      conf: `issues=${issues.length}`,
      facts: issues,
      explain: 'พบความไม่สอดคล้องภายในฟิลด์ของโครงการเดียวกันจากชุดข้อมูลสาธารณะ',
      innocent: 'อาจเป็นข้อผิดพลาดการบันทึกต้นทางหรือการแปลงปีงบ/ค.ศ.',
      evidence: ['contracts-cache · cross-field check · R12'],
    });
  }

  return { projectAlerts, contractorRisks };
}
