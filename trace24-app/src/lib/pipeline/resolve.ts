import { normalizeCompanyName } from './normalize';
import type { PipelineReportLike } from './types';

export type EntityCluster = {
  id: string;
  canonical: string;
  aliases: string[];
  memberIds: string[];
  type: 'company' | 'person' | 'project';
  confidence: number;
};

function tokens(name: string) {
  return new Set(
    normalizeCompanyName(name)
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );
}

function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

/** Entity resolution: cluster near-duplicate company/person/project names */
export function resolveEntities(report: PipelineReportLike): EntityCluster[] {
  const clusters: EntityCluster[] = [];

  const companies = Object.entries(report.contractors || {}).map(([id, c]) => ({
    id: `company:${id}`,
    name: c.name,
    type: 'company' as const,
  }));

  const people = companies
    .filter((c) => /^(นาย|นาง|นางสาว)/.test(c.name))
    .map((c) => ({ ...c, type: 'person' as const }));

  const projects = Object.entries(report.projects || {}).map(([id, p]) => ({
    id: `project:${id}`,
    name: p.name,
    type: 'project' as const,
  }));

  function clusterGroup(
    items: { id: string; name: string; type: EntityCluster['type'] }[],
    threshold: number
  ) {
    const used = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      if (used.has(items[i].id)) continue;
      const seed = items[i];
      const members = [seed];
      used.add(seed.id);
      const seedTok = tokens(seed.name);
      for (let j = i + 1; j < items.length; j++) {
        if (used.has(items[j].id)) continue;
        const sim = jaccard(seedTok, tokens(items[j].name));
        if (sim >= threshold) {
          members.push(items[j]);
          used.add(items[j].id);
        }
      }
      if (members.length === 1 && seed.type === 'project') continue; // only keep project clusters with aliases
      clusters.push({
        id: `er-${seed.type}-${clusters.length}`,
        canonical: normalizeCompanyName(seed.name),
        aliases: [...new Set(members.map((m) => m.name))],
        memberIds: members.map((m) => m.id),
        type: seed.type,
        confidence: members.length > 1 ? 0.82 : 0.95,
      });
    }
  }

  clusterGroup(companies, 0.72);
  clusterGroup(people, 0.85);
  // project near-duplicates
  clusterGroup(projects.slice(0, 120), 0.78);

  return clusters
    .filter((c) => c.type !== 'project' || c.aliases.length > 1)
    .sort((a, b) => b.aliases.length - a.aliases.length)
    .slice(0, 40);
}
