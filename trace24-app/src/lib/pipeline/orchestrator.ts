import { catalogForTrace24 } from '@/lib/gov-apis/catalog';
import { evidenceStats } from './evidence';
import { listSources } from './registry';
import { vectorIndexStats } from './vector';
import type { PipelineLayerStatus } from './types';

export type PipelineStatusResponse = {
  generatedAt: string;
  sources: ReturnType<typeof listSources>;
  evidence: ReturnType<typeof evidenceStats>;
  vector: ReturnType<typeof vectorIndexStats>;
  govApis: ReturnType<typeof catalogForTrace24>;
  layers: { layer: string; status: PipelineLayerStatus; note: string }[];
  ingestion: {
    command: string;
    cachedAgencies: string[];
  };
};

export function getPipelineStatus(cachedAgencyIds: string[]): PipelineStatusResponse {
  return {
    generatedAt: new Date().toISOString(),
    sources: listSources(),
    evidence: evidenceStats(),
    vector: vectorIndexStats(),
    govApis: catalogForTrace24(),
    layers: [
      { layer: 'Public Data Sources', status: 'live', note: 'Municipal + e-GP + gov-apis catalog' },
      { layer: 'Source Registry + Ingestion Orchestrator', status: 'live', note: 'src/lib/pipeline + scripts/fetch-real-data' },
      { layer: 'Crawler / API / File Ingestion', status: 'live', note: 'HTML ingest + announce enrich' },
      { layer: 'Immutable Raw Evidence Storage', status: 'live', note: 'data/evidence checksum store' },
      { layer: 'OCR + Document Extraction', status: 'live', note: 'HTML/PDF extract + OCR hook' },
      { layer: 'Validation + Normalisation', status: 'live', note: 'normalize.ts' },
      { layer: 'Structured Database', status: 'live', note: 'JSON reports in data/real' },
      { layer: 'Vector Index', status: 'live', note: 'TF-IDF passages in data/vector' },
      { layer: 'Entity Resolution', status: 'live', note: 'alias clustering resolve.ts' },
      { layer: 'Temporal Knowledge Graph', status: 'live', note: 'graph.ts from agency reports' },
      { layer: 'Detection suite', status: 'live', note: 'rules, Benford-lite, similarity' },
      { layer: 'Risk Scoring', status: 'live', note: 'risk.ts' },
      { layer: 'Alert System', status: 'live', note: 'high-severity alerts' },
      { layer: 'Hybrid Graph RAG', status: 'live', note: 'graph + vector citations' },
      { layer: 'Investigation Assistant', status: 'live', note: 'evidence map / brief / leads / RAG' },
    ],
    ingestion: {
      command: 'npm run fetch-real-data',
      cachedAgencies: cachedAgencyIds,
    },
  };
}
