import { llmStatus } from '@/lib/llm';

export async function GET() {
  return Response.json({
    ...llmStatus(),
    actions: [
      'rag',
      'review-signals',
      'propose-rules',
      'refine-brief',
      'dashboard-brief',
      'explain-signal',
      'draft-request',
      'extract-announce',
      'graph-story',
      'peer-narrative',
      'price-compare',
    ],
    ruleProposer: {
      store: 'data/rules/store.json',
      flow: 'pack + admin feedback → LLM draft JSON → human approve → runApprovedDynamicRules',
    },
    guardrails: [
      'Deterministic rules remain source of truth for risk scores',
      'LLM must not invent URLs, winners, or amounts',
      'Rule proposals always require human approval',
    ],
  });
}
