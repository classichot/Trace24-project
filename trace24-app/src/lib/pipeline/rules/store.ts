import fs from 'fs';
import path from 'path';
import type { ProposedRule, RuleStoreFile, SignalFeedback, SignalFeedbackLabel } from './types';

function isServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/** Committed seed (read-only on Vercel). */
function committedRoot() {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'rules');
}

/**
 * Writable location for proposals/feedback.
 * Vercel/Lambda only allow writes under /tmp — cwd (/var/task) is read-only.
 */
function writableRoot() {
  if (isServerless()) return path.join('/tmp', 'trace24-rules');
  return committedRoot();
}

function storeFile(root: string) {
  return path.join(root, 'store.json');
}

function emptyStore(): RuleStoreFile {
  return { version: 1, updatedAt: new Date().toISOString(), proposals: [], feedback: [] };
}

function readStoreFile(file: string): RuleStoreFile | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as RuleStoreFile;
  } catch {
    return null;
  }
}

export function ensureRuleStore(): RuleStoreFile {
  // Instance-local writes first (after propose/approve on this warm lambda)
  const fromWritable = readStoreFile(storeFile(writableRoot()));
  if (fromWritable) return fromWritable;

  // Committed seed in the deployment bundle
  const fromCommitted = readStoreFile(storeFile(committedRoot()));
  if (fromCommitted) return fromCommitted;

  const s = emptyStore();
  try {
    const root = writableRoot();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(storeFile(root), JSON.stringify(s, null, 2), 'utf8');
  } catch {
    /* read-only filesystem — keep empty in memory for this request */
  }
  return s;
}

function saveStore(store: RuleStoreFile) {
  store.updatedAt = new Date().toISOString();
  const root = writableRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(storeFile(root), JSON.stringify(store, null, 2), 'utf8');
}

export function listProposals(status?: ProposedRule['status']) {
  const store = ensureRuleStore();
  return status ? store.proposals.filter((p) => p.status === status) : store.proposals;
}

export function listFeedback(agencyId?: string) {
  const store = ensureRuleStore();
  return agencyId ? store.feedback.filter((f) => f.agencyId === agencyId) : store.feedback;
}

export function addProposals(proposals: ProposedRule[]) {
  const store = ensureRuleStore();
  store.proposals = [...proposals, ...store.proposals].slice(0, 200);
  saveStore(store);
  return proposals;
}

export function getProposal(id: string) {
  return ensureRuleStore().proposals.find((p) => p.id === id) || null;
}

export function updateProposalStatus(
  id: string,
  status: 'approved' | 'rejected',
  opts: { by?: string; reason?: string } = {}
) {
  const store = ensureRuleStore();
  const idx = store.proposals.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  const p = { ...store.proposals[idx], status, updatedAt: now };
  if (status === 'approved') {
    p.approvedAt = now;
    p.approvedBy = opts.by || 'admin';
    delete p.rejectedAt;
    delete p.rejectedReason;
  } else {
    p.rejectedAt = now;
    p.rejectedReason = opts.reason || 'rejected';
  }
  store.proposals[idx] = p;
  saveStore(store);
  return p;
}

export function addSignalFeedback(input: {
  agencyId: string;
  signalId: string;
  ruleId?: string;
  label: SignalFeedbackLabel;
  note?: string;
}) {
  const store = ensureRuleStore();
  const item: SignalFeedback = {
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    agencyId: input.agencyId,
    signalId: input.signalId,
    ruleId: input.ruleId,
    label: input.label,
    note: input.note,
    at: new Date().toISOString(),
  };
  store.feedback = [item, ...store.feedback].slice(0, 500);
  saveStore(store);
  return item;
}

export function feedbackSummary(agencyId?: string) {
  const rows = listFeedback(agencyId);
  const confirmed = rows.filter((r) => r.label === 'confirmed').length;
  const falsePositive = rows.filter((r) => r.label === 'false_positive').length;
  const needsData = rows.filter((r) => r.label === 'needs_data').length;
  const notes = rows
    .filter((r) => r.note)
    .slice(0, 12)
    .map((r) => `${r.label}: ${r.note}`);
  return { confirmed, falsePositive, needsData, notes, total: rows.length };
}
