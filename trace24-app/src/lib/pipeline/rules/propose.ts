import { chatCompletion, parseJsonLoose } from '@/lib/llm/client';
import type { InvestigationPack } from '../types';
import { addProposals, feedbackSummary } from './store';
import type { ExecutableRule, ProposedRule } from './types';

const GUARDRAILS = `You design measurable Red Flag rules for TRACE24 (Thai municipal procurement).
- Propose ONLY rules that can be computed from structured fields: method share, supplier concentration, repeat winners, award/budget ratio, missing price rate.
- Do NOT invent corruption claims. Rules are drafts requiring human approval.
- needsHumanApproval must always be true.
- Prefer Thai titles/rationale.
- executable.kind must be one of: method_share, supplier_concentration, repeat_winner, award_budget_ratio, missing_price_rate.
- Include numeric thresholds in executable params.`;

type LlmProposal = {
  suggestedRuleId: string;
  title: string;
  category: string;
  rationale: string;
  featureHints: string[];
  thresholdSketch: string;
  needsHumanApproval: true;
  executable: ExecutableRule | null;
};

function normalizeExecutable(raw: unknown): ExecutableRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const kind = String(e.kind || '');
  const allowed = new Set([
    'method_share',
    'supplier_concentration',
    'repeat_winner',
    'award_budget_ratio',
    'missing_price_rate',
  ]);
  if (!allowed.has(kind)) return null;
  return {
    kind: kind as ExecutableRule['kind'],
    method: typeof e.method === 'string' ? e.method : undefined,
    minShare: typeof e.minShare === 'number' ? e.minShare : Number(e.minShare) || undefined,
    minCount: typeof e.minCount === 'number' ? e.minCount : Number(e.minCount) || undefined,
    minRatio: typeof e.minRatio === 'number' ? e.minRatio : Number(e.minRatio) || undefined,
    minSamples: typeof e.minSamples === 'number' ? e.minSamples : Number(e.minSamples) || undefined,
    defaultSeverity:
      e.defaultSeverity === 'High' || e.defaultSeverity === 'Medium' || e.defaultSeverity === 'Low'
        ? e.defaultSeverity
        : undefined,
  };
}

export async function proposeAndPersistRules(
  pack: InvestigationPack,
  opts: { persist?: boolean } = {}
): Promise<{ model: string; notes: string; proposals: ProposedRule[] } | { error: string }> {
  const fb = feedbackSummary(pack.agencyId);
  const payload = {
    agencyId: pack.agencyId,
    riskOverall: pack.risk.overall,
    topSignals: pack.risk.signals.slice(0, 12).map((s) => ({
      id: s.id,
      ruleId: s.ruleId,
      title: s.title,
      severity: s.severity,
      explanation: s.explanation,
      innocent: s.innocentExplanation,
    })),
    leads: pack.leads.slice(0, 6),
    adminFeedback: fb,
    guidance:
      fb.falsePositive > fb.confirmed
        ? 'Admin marked many false positives — prefer stricter thresholds / higher minSamples'
        : 'Balance sensitivity and precision',
  };

  const result = await chatCompletion(
    [
      { role: 'system', content: GUARDRAILS },
      {
        role: 'user',
        content: `จาก investigation pack + feedback จาก Admin ด้านล่าง ร่างกฎใหม่ 2-4 ข้อ

${JSON.stringify(payload, null, 2)}

ตอบ JSON เท่านั้น:
{
  "notes": "...",
  "proposals": [
    {
      "suggestedRuleId": "R12",
      "title": "...",
      "category": "R12 · ...",
      "rationale": "...",
      "featureHints": ["..."],
      "thresholdSketch": "...",
      "needsHumanApproval": true,
      "executable": {
        "kind": "method_share|supplier_concentration|repeat_winner|award_budget_ratio|missing_price_rate",
        "method": "เฉพาะเจาะจง",
        "minShare": 0.7,
        "minCount": 5,
        "minRatio": 0.995,
        "minSamples": 10,
        "defaultSeverity": "Medium"
      }
    }
  ]
}`,
      },
    ],
    { temperature: 0.2, maxTokens: 1800, json: true }
  );

  if (!result.ok) return { error: result.error };
  const parsed = parseJsonLoose<{ notes?: string; proposals?: LlmProposal[] }>(result.content);
  if (!parsed?.proposals?.length) return { error: 'LLM returned invalid JSON for rule proposals' };

  const now = new Date().toISOString();
  const proposals: ProposedRule[] = parsed.proposals.map((p, i) => ({
    id: `rule-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    suggestedRuleId: p.suggestedRuleId || `R${20 + i}`,
    title: p.title || 'ร่างกฎ',
    category: p.category || 'dynamic',
    rationale: p.rationale || '',
    featureHints: p.featureHints || [],
    thresholdSketch: p.thresholdSketch || '',
    needsHumanApproval: true as const,
    status: 'draft' as const,
    agencyId: pack.agencyId,
    model: result.model,
    createdAt: now,
    updatedAt: now,
    executable: normalizeExecutable(p.executable),
    feedbackSnapshot: {
      confirmed: fb.confirmed,
      falsePositive: fb.falsePositive,
      needsData: fb.needsData,
      notes: fb.notes,
    },
    proposerNotes: parsed.notes,
  }));

  if (opts.persist !== false) addProposals(proposals);

  return { model: result.model, notes: parsed.notes || '', proposals };
}
