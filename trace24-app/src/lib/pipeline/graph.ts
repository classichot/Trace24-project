import { normalizeCompanyName, parseBaht } from './normalize';
import type { GraphEdge, NormalizedEntity, PipelineReportLike, TemporalGraph } from './types';

/**
 * Temporal knowledge graph — every relationship carries since/until when known.
 * Without time, the system must not imply a person/company link existed at award time.
 */
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
  const companyWins = new Map<string, string[]>();

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
    const since = pr.announced || null;
    nodes.push({
      id: `project:${pid}`,
      type: 'project',
      label: pr.name.slice(0, 80),
      attrs: {
        code: pr.code,
        award: pr.award || '—',
        method: pr.methodShort || '—',
        severity: pr.sevKey || 'Low',
        announced: since || '—',
      },
    });

    const docUrls = [
      ...(pr._sourceUrl ? [pr._sourceUrl] : []),
      ...(pr.timeline || [])
        .map((t) => t[2])
        .filter((u) => !!u && u !== 'e-GP'),
    ].slice(0, 4);

    edges.push({
      from: `agency:${agencyId}`,
      to: `project:${pid}`,
      rel: 'จัดจ้าง',
      since,
      until: null,
      evidenceIds: docUrls,
    });

    for (const [ti, row] of (pr.timeline || []).entries()) {
      const docId = `document:${pid}-${ti}`;
      if (!nodes.some((n) => n.id === docId) && row[2] && row[2] !== 'e-GP') {
        nodes.push({
          id: docId,
          type: 'document',
          label: row[1].slice(0, 60),
          attrs: { when: row[0], url: row[2] },
        });
        edges.push({
          from: `project:${pid}`,
          to: docId,
          rel: 'มีเอกสารประกาศ',
          since: row[0] || since,
          until: null,
          evidenceIds: [row[2]],
        });
      }
    }

    if (pr.winner && contractors[pr.winner]) {
      edges.push({
        from: `company:${pr.winner}`,
        to: `project:${pid}`,
        rel: 'ชนะสัญญา',
        since,
        until: null,
        evidenceIds: pr._sourceUrl ? [pr._sourceUrl] : docUrls.slice(0, 1),
        weight: parseBaht(pr.award) || 1,
      });
      const wins = companyWins.get(pr.winner) || [];
      wins.push(since || '');
      companyWins.set(pr.winner, wins);
    }
  }

  // Repeat-winner temporal span: first known win → latest known win
  for (const [cid, dates] of companyWins) {
    const cleaned = dates.filter(Boolean).sort();
    if (cleaned.length < 2) continue;
    edges.push({
      from: `company:${cid}`,
      to: `agency:${agencyId}`,
      rel: 'เป็นคู่สัญญาระหว่างช่วง',
      since: cleaned[0],
      until: cleaned[cleaned.length - 1],
      evidenceIds: [],
      weight: cleaned.length,
    });
  }

  return { nodes, edges, builtAt: new Date().toISOString() };
}

/** Neighbourhood walk from seed nodes (1–2 hops), preserving temporal edge fields. */
export function traverseGraphNeighbourhood(
  graph: TemporalGraph,
  seedIds: string[],
  hops = 2
): { nodes: NormalizedEntity[]; edges: GraphEdge[] } {
  const keep = new Set(seedIds);
  let frontier = [...seedIds];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const e of graph.edges) {
      if (keep.has(e.from) && !keep.has(e.to)) {
        keep.add(e.to);
        next.push(e.to);
      } else if (keep.has(e.to) && !keep.has(e.from)) {
        keep.add(e.from);
        next.push(e.from);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  const nodes = graph.nodes.filter((n) => keep.has(n.id));
  const edges = graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  return { nodes, edges };
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
