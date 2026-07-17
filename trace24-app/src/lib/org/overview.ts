import 'server-only';

import fs from 'fs';
import path from 'path';
import { loadAgencyCatalog } from '@/lib/agency-catalog';
import { listCases } from '@/lib/cases/store';
import type { CaseStatus, OversightCase } from '@/lib/cases/types';

export type BucketStat = {
  key: string;
  label: string;
  agencyCount: number;
  withCache: number;
  openCases: number;
  highPriority: number;
};

const OPEN: CaseStatus[] = [
  'เปิดใหม่',
  'มอบหมายแล้ว',
  'กำลังตรวจ',
  'รอเอกสาร',
  'ส่งหัวหน้า',
];

function isOpen(c: OversightCase) {
  return OPEN.includes(c.status);
}

function safeAgencyFileId(agencyId: string) {
  return agencyId.replace(/[^a-zA-Z0-9._\-ก-๙]/g, '_');
}

/** One-pass set of safe agency file ids that have contracts-cache. */
function cachedAgencyIds(): Set<string> {
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'contracts-cache');
  const ids = new Set<string>();
  try {
    if (!fs.existsSync(dir)) return ids;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.json.gz')) ids.add(file.slice(0, -8));
      else if (file.endsWith('.json')) ids.add(file.slice(0, -5));
    }
  } catch {
    /* ignore */
  }
  return ids;
}

/** Province + type (ministry-like) coverage for executive dashboard. */
export function buildOrgOverview(opts?: { province?: string; limit?: number }) {
  const limit = opts?.limit ?? 40;
  const provinceFilter = (opts?.province || '').trim();
  const catalog = loadAgencyCatalog();
  const cases = listCases();
  const cached = cachedAgencyIds();

  const byProv = new Map<string, BucketStat>();
  const byType = new Map<string, BucketStat>();

  for (const a of catalog) {
    if (provinceFilter && a.prov !== provinceFilter) continue;
    const prov = a.prov || 'ไม่ระบุจังหวัด';
    const tshort = a.tshort || a.type || 'อื่น ๆ';
    const hasCache = cached.has(safeAgencyFileId(a.id));

    let p = byProv.get(prov);
    if (!p) {
      p = { key: prov, label: prov, agencyCount: 0, withCache: 0, openCases: 0, highPriority: 0 };
      byProv.set(prov, p);
    }
    p.agencyCount += 1;
    if (hasCache) p.withCache += 1;

    let t = byType.get(tshort);
    if (!t) {
      t = { key: tshort, label: tshort, agencyCount: 0, withCache: 0, openCases: 0, highPriority: 0 };
      byType.set(tshort, t);
    }
    t.agencyCount += 1;
    if (hasCache) t.withCache += 1;
  }

  for (const c of cases) {
    if (provinceFilter && c.province && c.province !== provinceFilter) continue;
    const prov = c.province || 'ไม่ระบุจังหวัด';
    const tshort = c.agencyType || 'อื่น ๆ';
    if (isOpen(c)) {
      const p = byProv.get(prov);
      if (p) {
        p.openCases += 1;
        if (c.priority === 'High') p.highPriority += 1;
      } else {
        byProv.set(prov, {
          key: prov,
          label: prov,
          agencyCount: 0,
          withCache: 0,
          openCases: 1,
          highPriority: c.priority === 'High' ? 1 : 0,
        });
      }
      const t = byType.get(tshort);
      if (t) {
        t.openCases += 1;
        if (c.priority === 'High') t.highPriority += 1;
      }
    }
  }

  const sortBuckets = (arr: BucketStat[]) =>
    arr
      .sort(
        (a, b) =>
          b.openCases - a.openCases ||
          b.highPriority - a.highPriority ||
          b.withCache - a.withCache ||
          b.agencyCount - a.agencyCount
      )
      .slice(0, limit);

  const openCases = cases.filter(isOpen);
  const statusCounts: Record<string, number> = {};
  for (const c of cases) {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
  }

  const scoped = provinceFilter
    ? catalog.filter((a) => a.prov === provinceFilter)
    : catalog;

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      catalogAgencies: scoped.length,
      withContractsCache: scoped.filter((a) => cached.has(safeAgencyFileId(a.id))).length,
      casesTotal: cases.length,
      casesOpen: openCases.length,
      casesHigh: openCases.filter((c) => c.priority === 'High').length,
    },
    statusCounts,
    byProvince: sortBuckets([...byProv.values()]),
    byType: sortBuckets([...byType.values()]),
    provinceFilter: provinceFilter || null,
  };
}

export function buildOrgQueue(opts?: {
  status?: string;
  assignee?: string;
  province?: string;
  priority?: string;
}) {
  let items = listCases();
  if (opts?.status) items = items.filter((c) => c.status === opts.status);
  if (opts?.assignee) {
    const a = opts.assignee.trim().toLowerCase();
    items = items.filter((c) => (c.assignee || '').toLowerCase().includes(a));
  }
  if (opts?.province) items = items.filter((c) => c.province === opts.province);
  if (opts?.priority) items = items.filter((c) => c.priority === opts.priority);

  const open = items.filter(isOpen);
  const closed = items.filter((c) => !isOpen(c));

  const byAssignee = new Map<string, number>();
  for (const c of open) {
    const key = c.assignee?.trim() || 'ยังไม่มอบหมาย';
    byAssignee.set(key, (byAssignee.get(key) || 0) + 1);
  }

  return {
    generatedAt: new Date().toISOString(),
    open,
    closed,
    byAssignee: [...byAssignee.entries()]
      .map(([assignee, count]) => ({ assignee, count }))
      .sort((a, b) => b.count - a.count),
  };
}
