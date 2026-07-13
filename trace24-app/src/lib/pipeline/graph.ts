import { normalizeCompanyName, parseBaht } from './normalize';
import type { GraphEdge, NormalizedEntity, PipelineReportLike, TemporalGraph } from './types';

/** Build a temporal knowledge graph from a TRACE24 agency report */
export function buildTemporalGraph(report: PipelineReportLike): TemporalGraph {
  const agencyId = report.agency?.id || 'agency';
  const nodes: NormalizedEntity[] = [
    {
      id: `agency:${agencyId}`,
      type: 'agency',
      label: report.agency?.th || agencyId,
      attrs: { web: report.agency?.web || '', dataUrl: report.agency?.dataUrl || '' },
    },
  ];
  const edges: GraphEdge[] = [];
  const contractors = report.contractors || {};

  for (const [cid, co] of Object.entries(contractors)) {
    nodes.push({
      id: `company:${cid}`,
      type: 'company',
      label: normalizeCompanyName(co.name),
      attrs: {
        contracts: co.contracts ?? 0,
        total: co.total ?? '—',
      },
    });
  }

  for (const [pid, pr] of Object.entries(report.projects || {})) {
    nodes.push({
      id: `project:${pid}`,
      type: 'project',
      label: pr.name.slice(0, 80),
      attrs: {
        code: pr.code,
        award: pr.award || '—',
        method: pr.methodShort || '—',
        severity: pr.sevKey || 'Low',
      },
    });
    edges.push({
      from: `agency:${agencyId}`,
      to: `project:${pid}`,
      rel: 'จัดจ้าง',
      since: pr.announced || null,
      evidenceIds: (pr.timeline || [])
        .map((t) => t[2])
        .filter((u) => !!u && u !== 'e-GP')
        .slice(0, 3),
    });
    if (pr.winner && contractors[pr.winner]) {
      edges.push({
        from: `company:${pr.winner}`,
        to: `project:${pid}`,
        rel: 'ชนะสัญญา',
        since: pr.announced || null,
        evidenceIds: pr._sourceUrl ? [pr._sourceUrl] : [],
        weight: parseBaht(pr.award) || 1,
      });
    }
  }

  return { nodes, edges, builtAt: new Date().toISOString() };
}

/** Lightweight community / concentration heuristics on the graph */
export function detectSupplierConcentration(report: PipelineReportLike) {
  const tops = report.topContractors || [];
  if (tops.length < 2) return null;
  const totalN = tops.reduce((s, t) => s + t.n, 0) || 1;
  const topShare = tops[0].n / totalN;
  if (topShare < 0.25) return null;
  return {
    supplierId: tops[0].id,
    name: tops[0].name,
    share: topShare,
    contracts: tops[0].n,
  };
}
