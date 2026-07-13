/** LLM Rule Proposer — draft → human approve → detect.ts dynamic runner */

export type RuleStatus = 'draft' | 'approved' | 'rejected';

export type SignalFeedbackLabel = 'confirmed' | 'false_positive' | 'needs_data';

export type SignalFeedback = {
  id: string;
  agencyId: string;
  signalId: string;
  ruleId?: string;
  label: SignalFeedbackLabel;
  note?: string;
  at: string;
};

export type ExecutableRuleKind =
  | 'method_share'
  | 'supplier_concentration'
  | 'repeat_winner'
  | 'award_budget_ratio'
  | 'missing_price_rate';

export type ExecutableRule = {
  kind: ExecutableRuleKind;
  /** method short name for method_share, e.g. เฉพาะเจาะจง */
  method?: string;
  /** 0–1 thresholds */
  minShare?: number;
  /** absolute counts */
  minCount?: number;
  /** award/budget ratio e.g. 0.995 */
  minRatio?: number;
  /** minimum sample size before firing */
  minSamples?: number;
  defaultSeverity?: 'High' | 'Medium' | 'Low';
};

export type ProposedRule = {
  id: string;
  suggestedRuleId: string;
  title: string;
  category: string;
  rationale: string;
  featureHints: string[];
  thresholdSketch: string;
  needsHumanApproval: true;
  status: RuleStatus;
  agencyId: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  executable: ExecutableRule | null;
  feedbackSnapshot: {
    confirmed: number;
    falsePositive: number;
    needsData: number;
    notes: string[];
  };
  proposerNotes?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedReason?: string;
};

export type RuleStoreFile = {
  version: 1;
  updatedAt: string;
  proposals: ProposedRule[];
  feedback: SignalFeedback[];
};
