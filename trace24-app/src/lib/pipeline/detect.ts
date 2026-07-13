import { detectSupplierConcentration } from './graph';
import { methodBucket, parseBaht } from './normalize';
import type { PipelineReportLike, RiskSignal } from './types';

function confFromText(conf?: string) {
  const m = conf?.match(/([0-9]*\.?[0-9]+)/);
  return m ? Number(m[1]) : 0.7;
}

/** Rule engine — project alerts already computed + agency-level rules */
export function runRuleEngine(report: PipelineReportLike): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const projects = Object.entries(report.projects || {});

  for (const [pid, pr] of projects) {
    for (const [i, a] of (pr.alerts || []).entries()) {
      const ruleId = a.tag?.split('·')[0]?.trim() || `R?`;
      signals.push({
        id: `sig-${pid}-${i}`,
        ruleId,
        category: a.tag || 'rule',
        title: a.title,
        severity: (a.sevKey as RiskSignal['severity']) || 'Low',
        score: a.sevKey === 'High' ? 0.85 : a.sevKey === 'Medium' ? 0.55 : 0.25,
        confidence: confFromText(a.conf),
        subjectIds: [`project:${pid}`],
        explanation: a.explain,
        innocentExplanation: a.innocent,
        evidenceRefs: a.evidence || [],
      });
    }
  }

  const methods = projects.map(([, p]) => methodBucket(p.methodShort || ''));
  const specific = methods.filter((m) => m === 'เฉพาะเจาะจง').length;
  const specificPct = methods.length ? specific / methods.length : 0;
  if (specificPct >= 0.7 && methods.length >= 10) {
    signals.push({
      id: 'sig-agency-r3',
      ruleId: 'R3',
      category: 'R3 · กระบวนการ',
      title: 'สัดส่วนวิธีเฉพาะเจาะจงสูง',
      severity: specificPct >= 0.85 ? 'High' : 'Medium',
      score: specificPct,
      confidence: 0.88,
      subjectIds: [`agency:${report.agency?.id || 'agency'}`],
      explanation: `พบวิธีเฉพาะเจาะจง ${Math.round(specificPct * 100)}% ของโครงการในชุดข้อมูลนี้`,
      innocentExplanation: 'งานใต้เกณฑ์วงเงินอาจใช้วิธีเฉพาะเจาะจงได้ตามระเบียบ',
      evidenceRefs: report.sources?.map((s) => s.url) || [],
    });
  }

  const conc = detectSupplierConcentration(report);
  if (conc) {
    signals.push({
      id: 'sig-agency-conc',
      ruleId: 'R1',
      category: 'R1 · การแข่งขัน',
      title: 'ผู้รับจ้างรายเดียวถือครองสัญญาสูง',
      severity: conc.share >= 0.4 ? 'High' : 'Medium',
      score: conc.share,
      confidence: 0.8,
      subjectIds: [`company:${conc.supplierId}`],
      explanation: `${conc.name} ชนะ ${conc.contracts} สัญญา (~${Math.round(conc.share * 100)}% ของผู้รับจ้างที่พบ)`,
      innocentExplanation: 'ในพื้นที่อาจมีผู้รับเหมาคุณสมบัติจำกัด',
      evidenceRefs: [],
    });
  }

  return signals;
}

/** Benford / distribution tests — partial: award digit distribution check */
export function runDistributionTests(report: PipelineReportLike): RiskSignal[] {
  const firstDigits: number[] = [];
  for (const pr of Object.values(report.projects || {})) {
    const n = parseBaht(pr.award);
    if (n && n >= 10) {
      const d = Number(String(Math.floor(n)).replace(/^0+/, '')[0]);
      if (d >= 1 && d <= 9) firstDigits.push(d);
    }
  }
  if (firstDigits.length < 25) return [];

  const counts = Array.from({ length: 9 }, () => 0);
  for (const d of firstDigits) counts[d - 1]++;
  const total = firstDigits.length;
  // Benford expected for digit 1 ≈ 30.1%
  const observed1 = counts[0] / total;
  const expected1 = Math.log10(2);
  const delta = Math.abs(observed1 - expected1);
  if (delta < 0.12) return [];

  return [
    {
      id: 'sig-benford-1',
      ruleId: 'STAT-BENFORD',
      category: 'สถิติ · การกระจายตัว',
      title: 'การกระจายเลขนำของราคาเบี่ยงจาก Benford',
      severity: delta > 0.2 ? 'Medium' : 'Low',
      score: Math.min(1, delta * 2),
      confidence: 0.55,
      subjectIds: [`agency:${report.agency?.id || 'agency'}`],
      explanation: `เลขนำ “1” พบ ${(observed1 * 100).toFixed(1)}% (คาด ~${(expected1 * 100).toFixed(1)}%) จากราคา ${total} รายการ — เป็นสัญญาณให้ตรวจเพิ่ม ไม่ใช่ข้อพิสูจน์`,
      innocentExplanation: 'ชุดตัวอย่างเล็กหรือเกณฑ์ราคาอาจทำให้การกระจายเพี้ยนได้',
      evidenceRefs: [],
    },
  ];
}

/** Similarity / collusion-ish title pairs already mirrored in ingest R8; surface concentration */
export function runSimilarityHints(report: PipelineReportLike): RiskSignal[] {
  const titles = Object.entries(report.projects || {}).map(([id, p]) => ({
    id,
    name: p.name,
  }));
  const out: RiskSignal[] = [];
  // cheap token overlap on a capped sample
  const sample = titles.slice(0, 80);
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      const a = new Set(sample[i].name.split(/\s+/).filter((w) => w.length > 3));
      const b = new Set(sample[j].name.split(/\s+/).filter((w) => w.length > 3));
      if (!a.size || !b.size) continue;
      let inter = 0;
      for (const w of a) if (b.has(w)) inter++;
      const sim = inter / Math.max(a.size, b.size);
      if (sim >= 0.75) {
        out.push({
          id: `sig-sim-${sample[i].id}-${sample[j].id}`,
          ruleId: 'R8',
          category: 'R8 · กระบวนการ',
          title: 'ชื่อโครงการคล้ายกันสูง',
          severity: 'Medium',
          score: sim,
          confidence: sim,
          subjectIds: [`project:${sample[i].id}`, `project:${sample[j].id}`],
          explanation: `ความคล้ายโทเคน ~${Math.round(sim * 100)}% ระหว่างโครงการสองรายการ`,
          innocentExplanation: 'หน่วยงานอาจใช้แม่แบบชื่อโครงการมาตรฐาน',
          evidenceRefs: [],
        });
        if (out.length >= 8) return out;
      }
    }
  }
  return out;
}
