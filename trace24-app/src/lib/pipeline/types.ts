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
};

export type CaseBrief = {
  title: string;
  summary: string;
  riskExplanation: string;
  sourceCitations: string[];
  keyFindings: string[];
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
  evidenceMap: EvidenceMapItem[];
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
  meta?: Record<string, string>;
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
      rows?: unknown[];
    }
  >;
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
