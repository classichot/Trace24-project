import { detectSupplierConcentration } from '../graph';
import { methodBucket, parseBaht } from '../normalize';
import type { PipelineReportLike, RiskSignal } from '../types';
import { listProposals } from './store';
import type { ExecutableRule, ProposedRule } from './types';

function sev(rule: ExecutableRule, score: number): RiskSignal['severity'] {
  if (rule.defaultSeverity) return rule.defaultSeverity;
  return score >= 0.85 ? 'High' : score >= 0.55 ? 'Medium' : 'Low';
}

export function evaluateExecutableRule(
  report: PipelineReportLike,
  proposal: ProposedRule
): RiskSignal | null {
  const ex = proposal.executable;
  if (!ex || proposal.status !== 'approved') return null;

  const projects = Object.entries(report.projects || {});
  const minSamples = ex.minSamples ?? 5;
  const agencyId = report.agency?.id || 'agency';

  if (ex.kind === 'method_share') {
    const method = ex.method || 'เฉพาะเจาะจง';
    const methods = projects.map(([, p]) => methodBucket(p.methodShort || ''));
    if (methods.length < minSamples) return null;
    const hit = methods.filter((m) => m === method).length;
    const share = hit / methods.length;
    const thr = ex.minShare ?? 0.7;
    if (share < thr) return null;
    return {
      id: `sig-dyn-${proposal.id}`,
      ruleId: proposal.suggestedRuleId,
      category: proposal.category || `${proposal.suggestedRuleId} · dynamic`,
      title: proposal.title,
      severity: sev(ex, share),
      score: share,
      confidence: 0.75,
      subjectIds: [`agency:${agencyId}`],
      explanation: `กฎที่อนุมัติแล้ว: สัดส่วนวิธี「${method}」=${Math.round(share * 100)}% (เกณฑ์ ≥${Math.round(thr * 100)}%)`,
      innocentExplanation: proposal.rationale,
      evidenceRefs: [],
    };
  }

  if (ex.kind === 'supplier_concentration') {
    const conc = detectSupplierConcentration(report);
    if (!conc) return null;
    const thr = ex.minShare ?? 0.35;
    if (conc.share < thr) return null;
    return {
      id: `sig-dyn-${proposal.id}`,
      ruleId: proposal.suggestedRuleId,
      category: proposal.category || `${proposal.suggestedRuleId} · dynamic`,
      title: proposal.title,
      severity: sev(ex, conc.share),
      score: conc.share,
      confidence: 0.78,
      subjectIds: [`company:${conc.supplierId}`],
      explanation: `กฎที่อนุมัติแล้ว: ${conc.name} ~${Math.round(conc.share * 100)}% (เกณฑ์ ≥${Math.round(thr * 100)}%)`,
      innocentExplanation: proposal.rationale,
      evidenceRefs: [],
    };
  }

  if (ex.kind === 'repeat_winner') {
    const counts = new Map<string, number>();
    for (const [, pr] of projects) {
      if (!pr.winner) continue;
      counts.set(pr.winner, (counts.get(pr.winner) || 0) + 1);
    }
    const minCount = ex.minCount ?? 5;
    let best: { id: string; n: number } | null = null;
    for (const [id, n] of counts) {
      if (!best || n > best.n) best = { id, n };
    }
    if (!best || best.n < minCount) return null;
    const name = report.contractors?.[best.id]?.name || best.id;
    const score = Math.min(1, best.n / Math.max(minCount * 2, 1));
    return {
      id: `sig-dyn-${proposal.id}`,
      ruleId: proposal.suggestedRuleId,
      category: proposal.category || `${proposal.suggestedRuleId} · dynamic`,
      title: proposal.title,
      severity: sev(ex, score),
      score,
      confidence: 0.72,
      subjectIds: [`company:${best.id}`],
      explanation: `กฎที่อนุมัติแล้ว: ${name} ชนะ ${best.n} โครงการ (เกณฑ์ ≥${minCount})`,
      innocentExplanation: proposal.rationale,
      evidenceRefs: [],
    };
  }

  if (ex.kind === 'award_budget_ratio') {
    const thr = ex.minRatio ?? 0.995;
    const ratios: { pid: string; ratio: number }[] = [];
    for (const [pid, pr] of projects) {
      const award = parseBaht(pr.award);
      const budget = parseBaht(pr.budget || pr.ref);
      if (!award || !budget || budget <= 0) continue;
      const ratio = award / budget;
      if (ratio >= thr) ratios.push({ pid, ratio });
    }
    if (ratios.length < (ex.minCount ?? 3)) return null;
    const score = Math.min(1, ratios.length / Math.max(projects.length, 1) + 0.4);
    return {
      id: `sig-dyn-${proposal.id}`,
      ruleId: proposal.suggestedRuleId,
      category: proposal.category || `${proposal.suggestedRuleId} · dynamic`,
      title: proposal.title,
      severity: sev(ex, score),
      score,
      confidence: 0.7,
      subjectIds: ratios.slice(0, 5).map((r) => `project:${r.pid}`),
      explanation: `กฎที่อนุมัติแล้ว: พบ ${ratios.length} โครงการที่ราคา/งบ ≥ ${thr} `,
      innocentExplanation: proposal.rationale,
      evidenceRefs: [],
    };
  }

  if (ex.kind === 'missing_price_rate') {
    if (projects.length < minSamples) return null;
    const missing = projects.filter(([, p]) => !p.award || p.award === '—').length;
    const share = missing / projects.length;
    const thr = ex.minShare ?? 0.5;
    if (share < thr) return null;
    return {
      id: `sig-dyn-${proposal.id}`,
      ruleId: proposal.suggestedRuleId,
      category: proposal.category || `${proposal.suggestedRuleId} · dynamic`,
      title: proposal.title,
      severity: sev(ex, share),
      score: share,
      confidence: 0.8,
      subjectIds: [`agency:${agencyId}`],
      explanation: `กฎที่อนุมัติแล้ว: ขาดราคา ${Math.round(share * 100)}% ของโครงการ (เกณฑ์ ≥${Math.round(thr * 100)}%)`,
      innocentExplanation: proposal.rationale,
      evidenceRefs: [],
    };
  }

  return null;
}

/** Run all human-approved dynamic rules */
export function runApprovedDynamicRules(report: PipelineReportLike): RiskSignal[] {
  const approved = listProposals('approved');
  const out: RiskSignal[] = [];
  for (const p of approved) {
    try {
      const sig = evaluateExecutableRule(report, p);
      if (sig) out.push({ ...sig, layer: 'signal', kind: sig.kind || 'other' });
    } catch {
      // never break core detection
    }
  }
  return out;
}
