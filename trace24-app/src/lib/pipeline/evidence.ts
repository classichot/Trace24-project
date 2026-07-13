import 'server-only';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { EvidenceClaim, EvidenceLocator, EvidenceObject } from './types';

const EVIDENCE_ROOT = path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'evidence');

/** Immutable raw evidence: original bytes + timestamp + checksum + source URL */
export function evidenceDir(agencyId: string) {
  return path.join(EVIDENCE_ROOT, agencyId);
}

export function sha256(buf: Buffer | string) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function ensureEvidenceRoot(agencyId: string) {
  const dir = evidenceDir(agencyId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function storeEvidence(input: {
  agencyId: string;
  sourceUrl: string;
  contentType: string;
  body: Buffer | string;
  labels?: string[];
  filenameHint?: string;
  extractionMethod?: string;
  extractedText?: string;
  confidence?: number;
}): EvidenceObject {
  const dir = ensureEvidenceRoot(input.agencyId);
  const buf = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body, 'utf8');
  const checksum = sha256(buf);
  const fetchedAt = new Date().toISOString();
  const safeHint = (input.filenameHint || 'blob').replace(/[^\w.-]+/g, '_').slice(0, 80);
  const storedName = `${fetchedAt.slice(0, 10)}_${checksum.slice(0, 12)}_${safeHint}`;
  const storedPath = path.join(dir, storedName);
  if (!fs.existsSync(storedPath)) {
    fs.writeFileSync(storedPath, buf);
  }

  let extractedTextPath: string | null = null;
  if (input.extractedText && input.extractedText.trim()) {
    extractedTextPath = `${storedPath}.extracted.txt`;
    if (!fs.existsSync(extractedTextPath)) {
      fs.writeFileSync(extractedTextPath, input.extractedText, 'utf8');
    }
  }

  const meta: EvidenceObject = {
    id: `ev_${checksum.slice(0, 16)}`,
    agencyId: input.agencyId,
    sourceUrl: input.sourceUrl,
    contentType: input.contentType,
    storedPath: path.relative(process.cwd(), storedPath).replace(/\\/g, '/'),
    fetchedAt,
    checksumSha256: checksum,
    bytes: buf.length,
    labels: input.labels || [],
    extractionMethod: input.extractionMethod,
    extractedTextPath: extractedTextPath
      ? path.relative(process.cwd(), extractedTextPath).replace(/\\/g, '/')
      : null,
    confidence: input.confidence,
  };
  fs.writeFileSync(`${storedPath}.meta.json`, JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

export function attachClaim(input: {
  evidence: EvidenceObject;
  claim: string;
  locator?: EvidenceLocator;
  extractedText: string;
  extractionMethod: string;
  confidence: number;
  entityIds?: string[];
}): EvidenceClaim {
  const claim: EvidenceClaim = {
    id: `claim_${sha256(`${input.evidence.id}|${input.claim}`).slice(0, 16)}`,
    claim: input.claim,
    evidenceId: input.evidence.id,
    sourceUrl: input.evidence.sourceUrl,
    documentPath: input.evidence.storedPath,
    locator: input.locator || {},
    downloadedAt: input.evidence.fetchedAt,
    checksumSha256: input.evidence.checksumSha256,
    extractedText: input.extractedText.slice(0, 4000),
    extractionMethod: input.extractionMethod,
    confidence: input.confidence,
    entityIds: input.entityIds || [],
    layer: 'fact',
  };
  const claimPath = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    input.evidence.storedPath + `.claim_${claim.id}.json`
  );
  fs.writeFileSync(claimPath, JSON.stringify(claim, null, 2), 'utf8');
  return claim;
}

export function listEvidence(agencyId: string): EvidenceObject[] {
  const dir = evidenceDir(agencyId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.meta.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as EvidenceObject)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
}

export function listClaims(agencyId: string): EvidenceClaim[] {
  const dir = evidenceDir(agencyId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.claim_.*\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as EvidenceClaim)
    .sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
}

export function evidenceStats(agencyId: string): { agencyId: string; count: number; bytes: number };
export function evidenceStats(): {
  agencies: { agencyId: string; count: number; bytes: number }[];
  total: number;
};
export function evidenceStats(agencyId?: string) {
  if (agencyId) {
    const items = listEvidence(agencyId);
    return {
      agencyId,
      count: items.length,
      bytes: items.reduce((s, e) => s + e.bytes, 0),
    };
  }
  if (!fs.existsSync(EVIDENCE_ROOT)) return { agencies: [], total: 0 };
  const agencies = fs
    .readdirSync(EVIDENCE_ROOT)
    .filter((d) => fs.statSync(path.join(EVIDENCE_ROOT, d)).isDirectory())
    .map((id) => evidenceStats(id));
  return {
    agencies,
    total: agencies.reduce((s, a) => s + a.count, 0),
  };
}
