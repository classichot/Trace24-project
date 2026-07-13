/** TRACE24 investigation pipeline — shared types for the architecture stack */

export type PipelineLayerStatus = 'live' | 'partial' | 'planned';

export type SourceKind =
  | 'procurement_portal'
  | 'municipal_website'
  | 'egp_announce'
  | 'dbd'
  | 'budget'
  | 'audit'
  | 'api';

export type SourceRecord = {
  id: string;
  owner: string;
  kind: SourceKind;
  url: string;
  updateFrequency: string;
  crawlerStatus: 'idle' | 'ok' | 'degraded' | 'failed' | 'planned';
  lastAccess: string | null;
  accessHistory: { at: string; ok: boolean; note: string }[];
};

export type EvidenceObject = {
  id: string;
  agencyId: string;
  sourceUrl: string;
  contentType: string;
  storedPath: string;
  fetchedAt: string;
  checksumSha256: string;
  bytes: number;
  labels: string[];
  /** Original bytes retained (immutable). Sidecar may hold extraction. */
  extractionMethod?: string;
  extractedTextPath?: string | null;
  confidence?: number;
};

/** Page / table / cell locator inside an original document */
export type EvidenceLocator = {
  page?: number | null;
  table?: number | null;
  cell?: string | null;
  section?: string | null;
  charStart?: number | null;
  charEnd?: number | null;
};

/**
 * Atomic claim with full provenance — survives source edits/removals.
 * Fact layer only: what was observed in a public document at fetch time.
 */
export type EvidenceClaim = {
  id: string;
  claim: string;
  evidenceId: string;
  sourceUrl: string;
  documentPath: string;
  locator: EvidenceLocator;
  downloadedAt: string;
  checksumSha256: string;
  extractedText: string;
  extractionMethod: string;
  confidence: number;
  entityIds: string[];
  layer: 'fact';
};

export type FactRecord = {
  id: string;
  statement: string;
  claimIds: string[];
  evidenceRefs: string[];
  entityIds: string[];
  observedAt: string | null;
  confidence: number;
};

export type AnalyticalConclusion = {
  id: string;
  statement: string;
  basedOnSignalIds: string[];
  basedOnFactIds: string[];
  /** Always non-accusatory framing */
  caveat: string;
  recommendedNextSteps: string[];
};

export type MissingInfoGap = {
  id: string;
  expected: string;
  observed: string;
  subjectIds: string[];
  coverage: number;
  expectedCount: number;
  observedCount: number;
  gapScore: number;
  evidenceRefs: string[];
};

export type NormalizedEntity = {
  id: string;
  type: 'agency' | 'project' | 'company' | 'person' | 'document' | 'payment';
  label: string;
  attrs: Record<string, string | number | null>;
};

export type GraphEdge = {
  from: string;
  to: string;
  rel: string;
  since?: string | null;
  until?: string | null;
  evidenceIds: string[];
  weight?: number;
};

export type TemporalGraph = {
  nodes: NormalizedEntity[];
  edges: GraphEdge[];
  builtAt: string;
};

export type RiskSignal = {
  id: string;
  ruleId: string;
  category: string;
  title: string;
  severity: 'High' | 'Medium' | 'Low';
  score: number;
  confidence: number;
  subjectIds: string[];
  explanation: string;
  innocentExplanation: string;
  evidenceRefs: string[];
  /** Confirmed observable facts supporting this signal (not a conclusion). */
  facts?: string[];
  /** missing_information | process | competition | network | statistical | disclosure */
  kind?: 'missing_information' | 'process' | 'competition' | 'network' | 'statistical' | 'disclosure' | 'other';
  layer?: 'signal';
};

export type RiskScores = {
  project: number;
  supplier: number;
  official: number;
  network: number;
  overall: number;
  signals: RiskSignal[];
};

export type AlertItem = {
  id: string;
  createdAt: string;
  severity: 'High' | 'Medium' | 'Low';
  title: string;
  body: string;
  signalIds: string[];
};

export type EvidenceMapItem = {
  id: string;
  label: string;
  kind: string;
  when: string;
  url: string | null;
  relatedEntityIds: string[];
  evidenceId?: string | null;
  checksumSha256?: string | null;
  extractionMethod?: string | null;
  confidence?: number | null;
  locator?: EvidenceLocator | null;
};

export type CaseBrief = {
  title: string;
  summary: string;
  riskExplanation: string;
  sourceCitations: string[];
  keyFindings: string[];
  /** Explicit: scores prioritize review; they do not prove misconduct. */
  scoreDisclaimer: string;
};

export type InvestigationLead = {
  id: string;
  question: string;
  why: string;
  missingDocuments: string[];
  nextActions: string[];
  priority: 'High' | 'Medium' | 'Low';
};

export type InvestigationPack = {
  agencyId: string;
  generatedAt: string;
  pipeline: { layer: string; status: PipelineLayerStatus; note: string }[];
  architecture: {
    evidenceLayer: string;
    intelligenceLayer: string;
    detectionLayer: string;
    explanationLayer: string;
    principle: string;
  };
  evidenceMap: EvidenceMapItem[];
  claims: EvidenceClaim[];
  facts: FactRecord[];
  missingInfo: MissingInfoGap[];
  conclusions: AnalyticalConclusion[];
  caseBrief: CaseBrief;
  leads: InvestigationLead[];
  risk: RiskScores;
  alerts: AlertItem[];
  graph: TemporalGraph;
  entityClusters: {
    id: string;
    canonical: string;
    aliases: string[];
    memberIds: string[];
    type: string;
    confidence: number;
  }[];
  vector: { passages: number; builtAt: string | null };
  extraction: {
    status: 'live';
    methods: string[];
    note: string;
  };
};

export type PipelineReportLike = {
  agency?: { id?: string; th?: string; dataUrl?: string; web?: string };
  meta?: Record<string, string | boolean | number | null | undefined>;
  sources?: {
    url: string;
    type: string;
    status: string;
    ok: boolean | null;
    last: string;
    docs: string;
  }[];
  projects?: Record<
    string,
    {
      code: string;
      name: string;
      methodShort?: string;
      award?: string;
      budget?: string;
      ref?: string;
      winner?: string | null;
      announced?: string;
      sevKey?: string;
      ind?: number;
      alerts?: {
        tag: string;
        title: string;
        sevKey: string;
        conf: string;
        explain: string;
        innocent: string;
        evidence?: string[];
      }[];
      timeline?: [string, string, string][];
      _sourceUrl?: string | null;
    }
  >;
  contractors?: Record<
    string,
    {
      name: string;
      contracts?: number;
      total?: string;
      reg?: string;
      address?: string;
      directors?: { name: string; note: string; flag?: boolean }[];
      related?: { id: string; name: string; note: string }[];
      risks?: { tag: string; text: string; sevKey: string }[];
      rows?: unknown[];
    }
  >;
  executives?: {
    name: string;
    title: string;
    since?: string | null;
    until?: string | null;
    sourceUrl?: string;
  }[];
  relatedParty?: {
    matches: {
      id: string;
      ruleId: string;
      matchType: string;
      severity: string;
      explanation: string;
    }[];
    coverage: string;
  };
  alerts?: { tag: string; text: string; sevKey: string }[];
  topContractors?: { id: string; name: string; value: string; n: number }[];
  caseFile?: {
    id: string;
    title: string;
    summary: string;
    signals?: string;
    evidence?: string[];
    questions?: [string, string][];
    timeline?: [string, string, string][];
  };
  priorityOrder?: string[];
  stats?: { label: string; value: string; sub: string }[];
};

/** Client-safe RAG result shape (no fs imports). */
export type RagCitation = {
  id: string;
  kind: string;
  text: string;
  url: string | null;
  score: number;
  entityIds: string[];
};

export type HybridRagResult = {
  query: string;
  answeredAt: string;
  answer: string;
  graphNodes: NormalizedEntity[];
  graphEdges: { from: string; to: string; rel: string; since?: string | null; until?: string | null }[];
  citations: RagCitation[];
  mode: 'hybrid-graph-vector' | 'hybrid-graph-vector+llm';
  llm?: { model: string };
  llmError?: string;
  extractiveAnswer?: string;
  /** Confirmed facts from documents / graph (not inferences). */
  facts: string[];
  /** Analytical inferences / risk signals (not proof). */
  inferences: string[];
  /** Rule / anomaly hits used in the explanation. */
  ruleHits: { id: string; title: string; severity: string; score: number }[];
  /** Structured next investigation steps. */
  nextSteps: string[];
  assessment: {
    riskLevel: 'High' | 'Medium' | 'Low' | 'Unknown';
    score100: number | null;
    caveat: string;
  };
};

/** Client-safe pipeline status payload (fetched from /api/pipeline). */
export type PipelineStatusResponse = {
  generatedAt: string;
  sources: SourceRecord[];
  evidence: Record<string, unknown>;
  vector: Record<string, unknown>;
  govApis: {
    mcpNote?: string;
    core?: unknown[];
    adjacent?: unknown[];
    notFit?: unknown[];
    [key: string]: unknown;
  };
  llm: {
    configured: boolean;
    enabled: boolean;
    model: string;
    baseUrl: string;
    note: string;
  };
  layers: { layer: string; status: PipelineLayerStatus; note: string }[];
  ingestion: {
    command: string;
    cachedAgencies: string[];
  };
};
