import type {
  AnalyticalConclusion,
  EvidenceClaim,
  FactRecord,
  MissingInfoGap,
  PipelineReportLike,
  RiskSignal,
} from './types';

const SCORE_DISCLAIMER =
  'คะแนนความเสี่ยงใช้จัดลำดับความสำคัญในการตรวจสอบเท่านั้น — ไม่ใช่ข้อพิสูจน์การทุจริตหรือความผิด';

/** Observable facts from structured report fields (fact layer). */
export function buildFactRecords(
  report: PipelineReportLike,
  claims: EvidenceClaim[] = []
): FactRecord[] {
  const facts: FactRecord[] = [];
  const now = new Date().toISOString();

  for (const [pid, pr] of Object.entries(report.projects || {})) {
    if (pr.winner) {
      facts.push({
        id: `fact-winner-${pid}`,
        statement: `โครงการ ${pr.code || pid} ประกาศผู้ชนะเป็น「${pr.winner}」`,
        claimIds: [],
        evidenceRefs: pr._sourceUrl ? [pr._sourceUrl] : [],
        entityIds: [`project:${pid}`, `company:${pr.winner}`],
        observedAt: pr.announced || null,
        confidence: pr._sourceUrl ? 0.9 : 0.7,
      });
    }
    if (pr.award && pr.award !== '—') {
      facts.push({
        id: `fact-award-${pid}`,
        statement: `โครงการ ${pr.code || pid} มีราคาตกลง/งบที่บันทึก = ${pr.award}`,
        claimIds: [],
        evidenceRefs: pr._sourceUrl ? [pr._sourceUrl] : [],
        entityIds: [`project:${pid}`],
        observedAt: pr.announced || null,
        confidence: 0.85,
      });
    }
    if (pr.methodShort) {
      facts.push({
        id: `fact-method-${pid}`,
        statement: `โครงการ ${pr.code || pid} ใช้วิธี「${pr.methodShort}」`,
        claimIds: [],
        evidenceRefs: pr._sourceUrl ? [pr._sourceUrl] : [],
        entityIds: [`project:${pid}`],
        observedAt: pr.announced || null,
        confidence: 0.8,
      });
    }
  }

  for (const src of report.sources || []) {
    facts.push({
      id: `fact-source-${facts.length}`,
      statement: `แหล่งข้อมูล「${src.type}」สถานะ ${src.status} · ${src.url}`,
      claimIds: [],
      evidenceRefs: [src.url],
      entityIds: [`agency:${report.agency?.id || 'agency'}`],
      observedAt: src.last || now,
      confidence: src.ok ? 0.85 : 0.5,
    });
  }

  for (const c of claims.slice(0, 40)) {
    facts.push({
      id: `fact-claim-${c.id}`,
      statement: c.claim,
      claimIds: [c.id],
      evidenceRefs: [c.sourceUrl, c.checksumSha256],
      entityIds: c.entityIds,
      observedAt: c.downloadedAt,
      confidence: c.confidence,
    });
  }

  return facts.slice(0, 80);
}

/** Measurable absence-of-data gaps → become risk signals of kind missing_information. */
export function detectMissingInformation(report: PipelineReportLike): {
  gaps: MissingInfoGap[];
  signals: RiskSignal[];
} {
  const projects = Object.entries(report.projects || {});
  const total = projects.length;
  const gaps: MissingInfoGap[] = [];
  const signals: RiskSignal[] = [];

  const withAward = projects.filter(([, p]) => p.award && p.award !== '—').length;
  const withWinner = projects.filter(([, p]) => !!p.winner).length;
  const withSource = projects.filter(([, p]) => !!p._sourceUrl).length;
  const withBudget = projects.filter(([, p]) => p.budget && p.budget !== '—').length;
  const brokenSources = (report.sources || []).filter((s) => s.ok === false).length;

  const pushGap = (
    id: string,
    expected: string,
    observed: string,
    expectedCount: number,
    observedCount: number,
    subjectIds: string[],
    evidenceRefs: string[]
  ) => {
    if (expectedCount <= 0) return;
    const coverage = observedCount / expectedCount;
    const gapScore = Math.max(0, 1 - coverage);
    if (gapScore < 0.15) return;
    gaps.push({
      id,
      expected,
      observed,
      subjectIds,
      coverage: Number(coverage.toFixed(3)),
      expectedCount,
      observedCount,
      gapScore: Number(gapScore.toFixed(3)),
      evidenceRefs,
    });
  };

  if (total >= 5) {
    pushGap(
      'gap-award-price',
      'โครงการที่ประกาศควรมีราคาตกลง/ราคาที่บันทึกได้',
      `พบราคา ${withAward}/${total}`,
      total,
      withAward,
      [`agency:${report.agency?.id || 'agency'}`],
      (report.sources || []).map((s) => s.url)
    );
    pushGap(
      'gap-winner',
      'โครงการที่ประกาศผลควรระบุผู้ชนะ',
      `พบผู้ชนะ ${withWinner}/${total}`,
      total,
      withWinner,
      [`agency:${report.agency?.id || 'agency'}`],
      []
    );
    pushGap(
      'gap-source-url',
      'แต่ละโครงการควรมี URL เอกสารต้นทาง',
      `มี URL ${withSource}/${total}`,
      total,
      withSource,
      [`agency:${report.agency?.id || 'agency'}`],
      []
    );
    pushGap(
      'gap-budget',
      'โครงการควรมีวงเงินงบประมาณประกอบ',
      `มีงบ ${withBudget}/${total}`,
      total,
      withBudget,
      [`agency:${report.agency?.id || 'agency'}`],
      []
    );
  }

  if (brokenSources > 0) {
    pushGap(
      'gap-source-removed',
      'แหล่งที่เคยเข้าถึงได้ควรยังเผยแพร่',
      `แหล่งล้มเหลว/ไม่พร้อม ${brokenSources} รายการ`,
      (report.sources || []).length || brokenSources,
      Math.max(0, (report.sources || []).length - brokenSources),
      [`agency:${report.agency?.id || 'agency'}`],
      (report.sources || []).filter((s) => s.ok === false).map((s) => s.url)
    );
  }

  // Winner declared but company unresolved in contractors map
  let unresolved = 0;
  for (const [, pr] of projects) {
    if (pr.winner && report.contractors && !report.contractors[pr.winner]) unresolved++;
  }
  if (unresolved > 0) {
    pushGap(
      'gap-company-identity',
      'ผู้ชนะที่ประกาศควร resolve เป็นนิติบุคคลในชุดข้อมูล',
      `ยังไม่ resolve ${unresolved} รายการ`,
      withWinner || unresolved,
      Math.max(0, (withWinner || unresolved) - unresolved),
      [`agency:${report.agency?.id || 'agency'}`],
      []
    );
  }

  for (const g of gaps) {
    signals.push({
      id: `sig-missing-${g.id}`,
      ruleId: 'R11',
      category: 'R11 · การเปิดเผยข้อมูล',
      title: g.expected,
      severity: g.gapScore >= 0.5 ? 'High' : g.gapScore >= 0.3 ? 'Medium' : 'Low',
      score: g.gapScore,
      confidence: 0.9,
      subjectIds: g.subjectIds,
      explanation: `${g.observed} (coverage ${(g.coverage * 100).toFixed(0)}%) — สันนิษฐานปิดบังข้อมูลไว้ก่อนเมื่อรายละเอียดไม่ครบจนตรวจหรือเปรียบเทียบลำบาก (ยังไม่ใช่ข้อพิสูจน์การทุจริต)`,
      innocentExplanation:
        'หน่วยงานอาจพิสูจน์หักล้างได้ด้วยการเปิดเผยเอกสารครบ หรือเอกสารอยู่คนละช่องทาง/ชุดข้อมูลยังไม่ครบ',
      evidenceRefs: g.evidenceRefs,
      facts: [g.observed, `คาดหวัง: ${g.expected}`],
      kind: 'missing_information',
      layer: 'signal',
    });
  }

  return { gaps, signals };
}

export function buildAnalyticalConclusions(
  facts: FactRecord[],
  signals: RiskSignal[],
  gaps: MissingInfoGap[]
): AnalyticalConclusion[] {
  const high = signals.filter((s) => s.severity === 'High' || s.score >= 0.7).slice(0, 6);
  if (!high.length && !gaps.length) {
    return [
      {
        id: 'conc-none',
        statement: 'ยังไม่มีสัญญาณระดับสูงจากการตรวจชุดข้อมูลปัจจุบัน',
        basedOnSignalIds: [],
        basedOnFactIds: facts.slice(0, 3).map((f) => f.id),
        caveat: SCORE_DISCLAIMER,
        recommendedNextSteps: ['ขยายการดึงสัญญา/ประกาศ', 'ตรวจ missing documents', 'ถาม Hybrid Graph RAG รายโครงการ'],
      },
    ];
  }

  return [
    {
      id: 'conc-patterns',
      statement:
        high.length > 0
          ? `พบรูปแบบที่ควรสอบสวนเพิ่ม ${high.length} สัญญาณ (รวมช่องว่างข้อมูล ${gaps.length} รายการ)`
          : `พบช่องว่างข้อมูลที่วัดได้ ${gaps.length} รายการ ควรติดตามการเปิดเผย`,
      basedOnSignalIds: high.map((s) => s.id),
      basedOnFactIds: facts.slice(0, 8).map((f) => f.id),
      caveat: `${SCORE_DISCLAIMER} รูปแบบเหล่านี้อาจสอดคล้องกับการจัดซื้อที่ชอบด้วยกฎหมายหรือข้อจำกัดของตลาดท้องถิ่น`,
      recommendedNextSteps: [
        'ตรวจสอบ beneficial ownership / กรรมการร่วม (เมื่อมี DBD)',
        'ขอเอกสาร TOR · ราคากลาง · รายชื่อผู้เสนอราคา ที่ยังไม่พบ',
        'เทียบ timeline การยื่นซองหากเข้าถึงได้โดยชอบ',
        'ตรวจเอกสารส่งมอบ/ตรวจรับของโครงการสัญญาณสูง',
      ],
    },
  ];
}

export { SCORE_DISCLAIMER };
