/**
 * R6 — possible contract splitting (แบ่งซื้อแบ่งจ้าง / ซอยสัญญา)
 * Same winner + highly similar titles (often same work type, different road names).
 */
import { titleStem, tokenSimilarity } from '@/lib/title-similarity';

export type SplitProject = {
  id: string;
  name: string;
  winner?: string | null;
  fy?: string;
  method?: string;
  awardN?: number;
  workCategoryId?: string;
};

export type SplitCluster = {
  winnerId: string;
  stem: string;
  projectIds: string[];
  totalAward: number;
  fy: string;
  workCategoryId: string;
  severity: 'High' | 'Medium';
};

export { titleStem };

function fyKey(fy?: string): string {
  const m = String(fy || '').match(/(\d{4})/);
  return m?.[1] || 'unknown';
}

/**
 * Cluster same-winner projects with similar title stems.
 * Returns clusters of size >= minSize.
 */
export function detectContractSplitClusters(
  projects: SplitProject[],
  opts: { minSize?: number } = {}
): SplitCluster[] {
  const minSize = opts.minSize ?? 3;
  const byWinner = new Map<string, SplitProject[]>();
  for (const p of projects) {
    if (!p.winner || !p.name) continue;
    if (!byWinner.has(p.winner)) byWinner.set(p.winner, []);
    byWinner.get(p.winner)!.push(p);
  }

  const clusters: SplitCluster[] = [];

  for (const [winnerId, list] of byWinner) {
    if (list.length < minSize) continue;

    // Group by stem within winner (+ soft fy bucket)
    const groups = new Map<string, SplitProject[]>();
    for (const p of list) {
      const stem = titleStem(p.name);
      if (stem.length < 8) continue;
      // merge into existing group if high similarity to any member's stem
      let key = `${fyKey(p.fy)}::${stem}`;
      for (const [k, members] of groups) {
        if (!k.startsWith(`${fyKey(p.fy)}::`)) continue;
        const otherStem = k.slice(k.indexOf('::') + 2);
        if (tokenSimilarity(stem, otherStem) > 0.8 || stem === otherStem) {
          key = k;
          break;
        }
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }

    for (const [key, members] of groups) {
      if (members.length < minSize) continue;
      const stem = key.slice(key.indexOf('::') + 2);
      const totalAward = members.reduce((s, p) => s + (p.awardN || 0), 0);
      const selectHeavy =
        members.filter((p) => /คัดเลือก|เฉพาะเจาะจง/i.test(p.method || '')).length >=
        Math.ceil(members.length * 0.6);
      const severity: 'High' | 'Medium' =
        members.length >= 5 || (members.length >= 3 && selectHeavy) || totalAward >= 10_000_000
          ? 'High'
          : 'Medium';

      clusters.push({
        winnerId,
        stem,
        projectIds: members.map((m) => m.id),
        totalAward,
        fy: fyKey(members[0]?.fy),
        workCategoryId: members[0]?.workCategoryId || 'other',
        severity,
      });
    }
  }

  return clusters.sort((a, b) => b.projectIds.length - a.projectIds.length);
}
