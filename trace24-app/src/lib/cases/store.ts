import 'server-only';

import fs from 'fs';
import path from 'path';
import type { CaseNote, CasePriority, CaseStatus, OversightCase } from './types';
import { CASE_STATUSES } from './types';

function isServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function committedDir() {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'cases');
}

function writableDir() {
  if (isServerless()) return path.join('/tmp', 'trace24-cases');
  return committedDir();
}

function caseFile(dir: string, id: string) {
  const safe = id.replace(/[^a-zA-Z0-9._\-]/g, '_');
  return path.join(dir, `${safe}.json`);
}

function readCaseFile(file: string): OversightCase | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as OversightCase;
  } catch {
    return null;
  }
}

function listIdsIn(dir: string): string[] {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

function newId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `case-${t}-${r}`;
}

function seedCases(): OversightCase[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'case-demo-takuapa',
      agencyId: 'egp-4820501',
      agencyName: 'เทศบาลเมืองตะกั่วป่า',
      province: 'พังงา',
      agencyType: 'เทศบาลเมือง',
      title: 'ตรวจโครงการก่อสร้างและเครือข่ายผู้รับจ้าง',
      summary:
        'เปิดสำนวนจากสัญญาณความเสี่ยงในแคตตาล็อก e-GP — รอตรวจเอกสารประกาศ/TOR และความเชื่อมโยงกรรมการ',
      status: 'กำลังตรวจ',
      priority: 'High',
      assignee: 'นักวิเคราะห์ ก.',
      openedAt: now,
      updatedAt: now,
      openedBy: 'ระบบสาธิต',
      projectIds: [],
      signalTags: ['R13', 'R26', 'เครือข่ายผู้รับจ้าง'],
      missingDocuments: [
        'ประกาศเชิญชวนฉบับเต็ม (PDF)',
        'เอกสาร TOR / ร่างสัญญา',
        'รายชื่อคณะกรรมการจัดซื้อจัดจ้าง',
      ],
      citations: [
        {
          label: 'แคตตาล็อกหน่วยงาน TRACE24',
          detail: 'agencyId egp-4820501',
        },
        {
          label: 'e-GP / contracts-cache',
          detail: 'สัญญาในแคชท้องถิ่นของระบบ',
        },
      ],
      notes: [
        {
          id: 'n1',
          at: now,
          by: 'ระบบสาธิต',
          text: 'เปิดสำนวนอัตโนมัติเพื่อสาธิตคิวงานองค์กร',
        },
      ],
      score100: 72,
    },
  ];
}

function ensureSeeded() {
  const dir = writableDir();
  fs.mkdirSync(dir, { recursive: true });
  const ids = listIdsIn(dir);
  const committedIds = listIdsIn(committedDir());
  if (ids.length === 0 && committedIds.length === 0) {
    for (const c of seedCases()) {
      fs.writeFileSync(caseFile(dir, c.id), JSON.stringify(c, null, 2), 'utf8');
      if (!isServerless()) {
        try {
          fs.mkdirSync(committedDir(), { recursive: true });
          fs.writeFileSync(caseFile(committedDir(), c.id), JSON.stringify(c, null, 2), 'utf8');
        } catch {
          /* ignore */
        }
      }
    }
  }
}

export function listCases(): OversightCase[] {
  ensureSeeded();
  const map = new Map<string, OversightCase>();
  for (const id of listIdsIn(committedDir())) {
    const c = readCaseFile(caseFile(committedDir(), id));
    if (c) map.set(c.id, c);
  }
  for (const id of listIdsIn(writableDir())) {
    const c = readCaseFile(caseFile(writableDir(), id));
    if (c) map.set(c.id, c);
  }
  return [...map.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function getCase(id: string): OversightCase | null {
  if (!id) return null;
  ensureSeeded();
  return (
    readCaseFile(caseFile(writableDir(), id)) ||
    readCaseFile(caseFile(committedDir(), id))
  );
}

export type CreateCaseInput = {
  agencyId: string;
  agencyName: string;
  province?: string;
  agencyType?: string;
  title?: string;
  summary?: string;
  priority?: CasePriority;
  assignee?: string;
  openedBy?: string;
  projectIds?: string[];
  signalTags?: string[];
  missingDocuments?: string[];
  citations?: OversightCase['citations'];
  score100?: number | null;
};

export function createCase(input: CreateCaseInput): OversightCase {
  const now = new Date().toISOString();
  const c: OversightCase = {
    id: newId(),
    agencyId: input.agencyId,
    agencyName: input.agencyName || input.agencyId,
    province: input.province || '',
    agencyType: input.agencyType || '',
    title: input.title || `สำนวนตรวจ — ${input.agencyName || input.agencyId}`,
    summary: input.summary || 'เปิดสำนวนจาก TRACE24 เพื่อติดตามและรวบรวมหลักฐาน',
    status: 'เปิดใหม่',
    priority: input.priority || 'Medium',
    assignee: input.assignee || '',
    openedAt: now,
    updatedAt: now,
    openedBy: input.openedBy || 'ผู้ใช้',
    projectIds: input.projectIds || [],
    signalTags: input.signalTags || [],
    missingDocuments: input.missingDocuments || [
      'ประกาศเชิญชวนฉบับเต็ม',
      'TOR / ร่างสัญญา',
      'รายงานการพิจารณาผล',
    ],
    citations: input.citations || [
      { label: 'TRACE24 agency report', detail: input.agencyId },
    ],
    notes: [],
    score100: input.score100 ?? null,
  };
  return saveCase(c);
}

export function saveCase(c: OversightCase): OversightCase {
  const next = { ...c, updatedAt: new Date().toISOString() };
  const dir = writableDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(caseFile(dir, next.id), JSON.stringify(next, null, 2), 'utf8');
  if (!isServerless()) {
    try {
      fs.mkdirSync(committedDir(), { recursive: true });
      fs.writeFileSync(caseFile(committedDir(), next.id), JSON.stringify(next, null, 2), 'utf8');
    } catch {
      /* ignore */
    }
  }
  return next;
}

export type PatchCaseInput = {
  status?: CaseStatus;
  priority?: CasePriority;
  assignee?: string;
  title?: string;
  summary?: string;
  projectIds?: string[];
  signalTags?: string[];
  missingDocuments?: string[];
  citations?: OversightCase['citations'];
  score100?: number | null;
  note?: { by?: string; text: string };
};

export function patchCase(id: string, patch: PatchCaseInput): OversightCase | null {
  const cur = getCase(id);
  if (!cur) return null;
  if (patch.status && !CASE_STATUSES.includes(patch.status)) {
    throw new Error(`สถานะไม่ถูกต้อง: ${patch.status}`);
  }
  const notes: CaseNote[] = [...(cur.notes || [])];
  if (patch.note?.text?.trim()) {
    notes.push({
      id: `n-${Date.now().toString(36)}`,
      at: new Date().toISOString(),
      by: patch.note.by || 'ผู้ใช้',
      text: patch.note.text.trim(),
    });
  }
  return saveCase({
    ...cur,
    status: patch.status ?? cur.status,
    priority: patch.priority ?? cur.priority,
    assignee: patch.assignee !== undefined ? patch.assignee : cur.assignee,
    title: patch.title ?? cur.title,
    summary: patch.summary ?? cur.summary,
    projectIds: patch.projectIds ?? cur.projectIds,
    signalTags: patch.signalTags ?? cur.signalTags,
    missingDocuments: patch.missingDocuments ?? cur.missingDocuments,
    citations: patch.citations ?? cur.citations,
    score100: patch.score100 !== undefined ? patch.score100 : cur.score100,
    notes,
  });
}
