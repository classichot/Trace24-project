import { runDistributionTests, runRuleEngine, runSimilarityHints } from './detect';
import { runApprovedDynamicRules } from './rules/evaluate';
import type { AlertItem, PipelineReportLike, RiskScores, RiskSignal } from './types';

function severityRank(s: RiskSignal['severity']) {
  return s === 'High' ? 3 : s === 'Medium' ? 2 : 1;
}

export function scoreRisks(report: PipelineReportLike): RiskScores {
  const signals = [
    ...runRuleEngine(report),
    ...runDistributionTests(report),
    ...runSimilarityHints(report),
    ...runApprovedDynamicRules(report),
  ].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.score - a.score);

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const projectSignals = signals.filter((s) => s.subjectIds.some((id) => id.startsWith('project:')));
  const supplierSignals = signals.filter((s) => s.subjectIds.some((id) => id.startsWith('company:')));
  const agencySignals = signals.filter((s) => s.subjectIds.some((id) => id.startsWith('agency:')));
  const networkSignals = signals.filter(
    (s) => s.ruleId === 'R8' || s.ruleId === 'R1' || s.ruleId === 'R5'
  );

  const project = avg(projectSignals.map((s) => s.score));
  const supplier = avg(supplierSignals.map((s) => s.score));
  const official = avg(agencySignals.map((s) => s.score)) * 0.6; // no official-person graph yet
  const network = avg(networkSignals.map((s) => s.score));
  const overall = Number(
    (project * 0.35 + supplier * 0.3 + network * 0.25 + official * 0.1).toFixed(3)
  );

  return {
    project: Number(project.toFixed(3)),
    supplier: Number(supplier.toFixed(3)),
    official: Number(official.toFixed(3)),
    network: Number(network.toFixed(3)),
    overall,
    signals: signals.slice(0, 40),
  };
}

export function buildAlerts(risk: RiskScores): AlertItem[] {
  return risk.signals
    .filter((s) => s.severity === 'High' || s.score >= 0.7)
    .slice(0, 12)
    .map((s) => ({
      id: `alert-${s.id}`,
      createdAt: new Date().toISOString(),
      severity: s.severity,
      title: s.title,
      body: s.explanation,
      signalIds: [s.id],
    }));
}
