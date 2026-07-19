import fs from 'fs';
import path from 'path';
import { chunkText } from './extract';
import { contractorDisplayName, projectDisplayLabel } from './normalize';
import type { PipelineReportLike } from './types';

export type VectorPassage = {
  id: string;
  agencyId: string;
  text: string;
  sourceUrl: string | null;
  entityIds: string[];
  kind: string;
};

export type VectorHit = VectorPassage & { score: number };

type TermIndex = {
  agencyId: string;
  builtAt: string;
  df: Record<string, number>;
  nDocs: number;
  passages: VectorPassage[];
  /** sparse tf vectors parallel to passages */
  tfs: Record<string, number>[];
};

function isServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/** Committed seed (read-only on Vercel). */
function committedRoot() {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'vector');
}

/** Vercel/Lambda only allow writes under /tmp. */
function writableRoot() {
  if (isServerless()) return path.join('/tmp', 'trace24-vector');
  return committedRoot();
}

/** Warm-lambda memory cache — works even when disk write fails. */
const memoryIndex = new Map<string, TermIndex>();

function indexPath(root: string, agencyId: string) {
  const safe = agencyId.replace(/[^a-zA-Z0-9._\-ก-๙]/g, '_');
  return path.join(root, `${safe}.json`);
}

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const parts = lower
    .replace(/[^\u0E00-\u0E7Fa-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const out: string[] = [...parts];
  // Character n-grams for continuous Thai script
  const thai = lower.replace(/[^\u0E00-\u0E7F]/g, '');
  for (let i = 0; i < thai.length - 1; i++) {
    out.push(thai.slice(i, i + 2));
    if (i + 3 <= thai.length) out.push(thai.slice(i, i + 3));
  }
  return out;
}

function tfMap(tokens: string[]) {
  const tf: Record<string, number> = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  return tf;
}

function cosine(a: Record<string, number>, b: Record<string, number>, idf: Record<string, number>) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [t, av] of Object.entries(a)) {
    const w = (idf[t] || 0) * av;
    na += w * w;
    if (b[t]) dot += w * (idf[t] || 0) * b[t];
  }
  for (const [t, bv] of Object.entries(b)) {
    const w = (idf[t] || 0) * bv;
    nb += w * w;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function readIndexFile(file: string): TermIndex | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as TermIndex;
  } catch {
    return null;
  }
}

/** Build passages from agency report (projects, alerts, timelines, contractors) */
export function passagesFromReport(agencyId: string, report: PipelineReportLike): VectorPassage[] {
  const out: VectorPassage[] = [];
  const agencyLabel = report.agency?.th || agencyId;

  out.push({
    id: `agency-${agencyId}`,
    agencyId,
    text: `${agencyLabel} ${report.meta?.scanSummary || ''} ${report.caseFile?.summary || ''}`,
    sourceUrl: report.agency?.dataUrl || null,
    entityIds: [`agency:${agencyId}`],
    kind: 'agency_summary',
  });

  for (const [pid, pr] of Object.entries(report.projects || {})) {
    const winnerName = contractorDisplayName(pr.winner, report.contractors);
    const base = `${projectDisplayLabel(pr)} ผู้ชนะ ${winnerName} ${pr.methodShort || ''} award ${pr.award || ''} budget ${pr.budget || ''}`;
    for (const [ci, chunk] of chunkText(base, 360, 40).entries()) {
      out.push({
        id: `proj-${pid}-${ci}`,
        agencyId,
        text: chunk,
        sourceUrl: pr._sourceUrl || null,
        entityIds: [`project:${pid}`, pr.winner ? `company:${pr.winner}` : ''].filter(Boolean),
        kind: 'project',
      });
    }
    for (const [ai, alert] of (pr.alerts || []).entries()) {
      out.push({
        id: `alert-${pid}-${ai}`,
        agencyId,
        text: `${projectDisplayLabel(pr)} · ผู้ชนะ ${winnerName} · ${alert.tag} ${alert.title} ${alert.explain} ${alert.innocent}`,
        sourceUrl: alert.evidence?.[0] || pr._sourceUrl || null,
        entityIds: [`project:${pid}`],
        kind: 'risk_alert',
      });
    }
    for (const [ti, row] of (pr.timeline || []).entries()) {
      out.push({
        id: `tl-${pid}-${ti}`,
        agencyId,
        text: `${row[0]} ${row[1]}`,
        sourceUrl: row[2] && row[2] !== 'e-GP' ? row[2] : pr._sourceUrl || null,
        entityIds: [`project:${pid}`],
        kind: 'timeline',
      });
    }
  }

  for (const [cid, co] of Object.entries(report.contractors || {})) {
    out.push({
      id: `co-${cid}`,
      agencyId,
      text: `ผู้รับจ้าง ${co.name} สัญญา ${co.contracts ?? 0} มูลค่า ${co.total || '—'}`,
      sourceUrl: null,
      entityIds: [`company:${cid}`],
      kind: 'contractor',
    });
  }

  return out;
}

export function buildVectorIndex(agencyId: string, report: PipelineReportLike): TermIndex {
  const passages = passagesFromReport(agencyId, report);
  const tfs = passages.map((p) => tfMap(tokenize(p.text)));
  const df: Record<string, number> = {};
  for (const tf of tfs) {
    for (const t of Object.keys(tf)) df[t] = (df[t] || 0) + 1;
  }
  const index: TermIndex = {
    agencyId,
    builtAt: new Date().toISOString(),
    df,
    nDocs: passages.length,
    passages,
    tfs,
  };

  memoryIndex.set(agencyId, index);

  try {
    const root = writableRoot();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(indexPath(root, agencyId), JSON.stringify(index), 'utf8');
  } catch {
    /* EROFS / tmp full — keep in-memory index for this warm instance */
  }

  // Local/dev: also persist under committed data/vector for git workflows
  if (!isServerless()) {
    try {
      const root = committedRoot();
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(indexPath(root, agencyId), JSON.stringify(index), 'utf8');
    } catch {
      /* ignore */
    }
  }

  return index;
}

export function loadVectorIndex(agencyId: string): TermIndex | null {
  const fromMem = memoryIndex.get(agencyId);
  if (fromMem) return fromMem;

  const fromWritable = readIndexFile(indexPath(writableRoot(), agencyId));
  if (fromWritable) {
    memoryIndex.set(agencyId, fromWritable);
    return fromWritable;
  }

  const fromCommitted = readIndexFile(indexPath(committedRoot(), agencyId));
  if (fromCommitted) {
    memoryIndex.set(agencyId, fromCommitted);
    return fromCommitted;
  }

  return null;
}

export function ensureVectorIndex(agencyId: string, report: PipelineReportLike): TermIndex {
  // Always rebuild when report is provided so tokenizer upgrades apply
  return buildVectorIndex(agencyId, report);
}

export function searchVectorIndex(
  agencyId: string,
  query: string,
  opts: { limit?: number; report?: PipelineReportLike } = {}
): VectorHit[] {
  const limit = opts.limit ?? 8;
  let index = loadVectorIndex(agencyId);
  if (!index && opts.report) index = buildVectorIndex(agencyId, opts.report);
  if (!index) return [];

  const qtf = tfMap(tokenize(query));
  const idf: Record<string, number> = {};
  for (const [t, d] of Object.entries(index.df)) {
    idf[t] = Math.log(1 + index.nDocs / (1 + d));
  }

  const scored = index.passages.map((p, i) => ({
    ...p,
    score: cosine(qtf, index!.tfs[i], idf),
  }));

  return scored
    .filter((h) => h.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function vectorIndexStats(agencyId: string): {
  agencyId: string;
  passages: number;
  builtAt: string | null;
};
export function vectorIndexStats(): {
  indexes: { agencyId: string; passages: number; builtAt: string | null }[];
  totalPassages: number;
};
export function vectorIndexStats(agencyId?: string) {
  if (agencyId) {
    const idx = loadVectorIndex(agencyId);
    return idx
      ? { agencyId, passages: idx.nDocs, builtAt: idx.builtAt }
      : { agencyId, passages: 0, builtAt: null };
  }

  const seen = new Set<string>();
  const indexes: { agencyId: string; passages: number; builtAt: string | null }[] = [];

  for (const [id, idx] of memoryIndex) {
    seen.add(id);
    indexes.push({ agencyId: id, passages: idx.nDocs, builtAt: idx.builtAt });
  }

  for (const root of [writableRoot(), committedRoot()]) {
    try {
      if (!fs.existsSync(root)) continue;
      for (const f of fs.readdirSync(root)) {
        if (!f.endsWith('.json')) continue;
        const id = f.replace(/\.json$/, '');
        if (seen.has(id)) continue;
        seen.add(id);
        indexes.push(vectorIndexStats(id));
      }
    } catch {
      /* ignore */
    }
  }

  return {
    indexes,
    totalPassages: indexes.reduce((s, i) => s + i.passages, 0),
  };
}
