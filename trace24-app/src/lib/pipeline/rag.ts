import { buildTemporalGraph } from './graph';
import { searchVectorIndex, ensureVectorIndex, type VectorHit } from './vector';
import type { HybridRagResult, NormalizedEntity, PipelineReportLike, RagCitation } from './types';

export type { HybridRagResult, RagCitation };

function graphHits(report: PipelineReportLike, query: string) {
  const graph = buildTemporalGraph(report);
  const q = query.toLowerCase();
  const nodes = graph.nodes
    .filter((n) => {
      const blob = `${n.label} ${Object.values(n.attrs).join(' ')}`.toLowerCase();
      return q.split(/\s+/).some((tok) => tok.length > 1 && blob.includes(tok));
    })
    .slice(0, 10);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = graph.edges
    .filter((e) => nodeIds.has(e.from) || nodeIds.has(e.to))
    .slice(0, 20)
    .map((e) => ({ from: e.from, to: e.to, rel: e.rel }));
  return { nodes, edges, graph };
}

function synthesizeAnswer(
  query: string,
  nodes: NormalizedEntity[],
  citations: RagCitation[]
): string {
  const lines: string[] = [];
  lines.push(`คำถาม: ${query}`);
  if (nodes.length) {
    lines.push(
      `โหนดในกราฟที่เกี่ยวข้อง: ${nodes
        .slice(0, 5)
        .map((n) => `${n.type}:${n.label}`)
        .join(' · ')}`
    );
  }
  if (citations.length) {
    lines.push('หลักฐานที่ดึงมาได้:');
    for (const [i, c] of citations.slice(0, 5).entries()) {
      lines.push(`${i + 1}. (${c.kind}, score ${c.score.toFixed(2)}) ${c.text.slice(0, 180)}`);
    }
  } else {
    lines.push('ไม่พบข้อความในดัชนีเวกเตอร์ที่ใกล้เคียงเพียงพอ — ลองคำค้นเป็นชื่อโครงการ/ผู้รับจ้าง');
  }
  lines.push(
    'หมายเหตุ: Hybrid Graph RAG โหมด extractive (กราฟ + TF-IDF) — ยังไม่เรียก LLM ภายนอก แต่มี citations พร้อม URL ต้นทาง'
  );
  return lines.join('\n');
}

/** Hybrid Graph RAG: temporal graph neighbourhood + local vector passages */
export function hybridGraphRag(
  agencyId: string,
  report: PipelineReportLike,
  query: string,
  opts: { rebuildIndex?: boolean; limit?: number } = {}
): HybridRagResult {
  if (opts.rebuildIndex) {
    ensureVectorIndex(agencyId, report);
  } else {
    ensureVectorIndex(agencyId, report);
  }

  const { nodes, edges } = graphHits(report, query);
  const vectorHits: VectorHit[] = searchVectorIndex(agencyId, query, {
    limit: opts.limit ?? 8,
    report,
  });

  // boost passages linked to graph nodes
  const nodeIds = new Set(nodes.map((n) => n.id));
  const citations: RagCitation[] = vectorHits
    .map((h) => ({
      id: h.id,
      kind: h.kind,
      text: h.text,
      url: h.sourceUrl,
      score: h.score * (h.entityIds.some((id) => nodeIds.has(id)) ? 1.25 : 1),
      entityIds: h.entityIds,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 8);

  return {
    query,
    answeredAt: new Date().toISOString(),
    answer: synthesizeAnswer(query, nodes, citations),
    graphNodes: nodes,
    graphEdges: edges,
    citations,
    mode: 'hybrid-graph-vector',
  };
}
