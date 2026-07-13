'use client';

import type { GraphFilter } from '@/context/trace24-context';

type GraphNode = {
  id: string;
  type: string;
  x: number;
  y: number;
  label: string;
};

export type GraphEdge = [string, string, string, boolean];

type GraphSvgProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selNodeId: string;
  graphFilter: GraphFilter;
  onSelectNode: (id: string) => void;
};

function filterMatch(n: GraphNode, graphFilter: GraphFilter) {
  if (graphFilter === 'all') return true;
  if (graphFilter === 'company') return n.type === 'company';
  if (graphFilter === 'projectNode')
    return n.type === 'project' || n.type === 'muni' || n.type === 'budget';
  if (graphFilter === 'people') return n.type === 'person' || n.type === 'addr';
  if (graphFilter === 'doc') return n.type === 'doc';
  return true;
}

export function GraphSvg({
  nodes,
  edges,
  selNodeId,
  graphFilter,
  onSelectNode,
}: GraphSvgProps) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];
  const nodeById: Record<string, GraphNode> = {};
  safeNodes.forEach((n) => {
    nodeById[n.id] = n;
  });

  const gNodes = safeNodes.map((n) => {
    const selN = selNodeId === n.id;
    const dim = !filterMatch(n, graphFilter);
    const styleByType: Record<
      string,
      { fill: string; stroke: string; sw: string; r: number; dash: string }
    > = {
      muni: { fill: '#111110', stroke: '#111110', sw: '0', r: 15, dash: '0' },
      budget: { fill: '#ECECE8', stroke: '#B4B4AE', sw: '1', r: 11, dash: '0' },
      project: { fill: '#F6F6F3', stroke: '#8B8B85', sw: '1', r: 11, dash: '0' },
      company: { fill: '#fff', stroke: '#111110', sw: '2', r: 13, dash: '0' },
      person: { fill: '#fff', stroke: '#55554F', sw: '1', r: 9, dash: '0' },
      addr: { fill: '#fff', stroke: '#55554F', sw: '1', r: 9, dash: '4 3' },
      doc: { fill: '#fff', stroke: '#8B8B85', sw: '1', r: 8, dash: '0' },
    };
    const st = styleByType[n.type] || styleByType.doc;
    const isRect = n.type === 'doc';
    return {
      id: n.id,
      x: n.x,
      y: n.y,
      label: n.label,
      isRect,
      rx: n.x - 8,
      ry: n.y - 8,
      r: st.r,
      fill: st.fill,
      stroke: isRect ? '#8B8B85' : st.stroke,
      sw: isRect ? '1' : st.sw,
      dash: st.dash,
      ring: st.r + 6,
      ringOp: selN ? '1' : '0',
      labelY: n.y + st.r + 17,
      labelWeight: selN ? 600 : 400,
      op: dim ? '.15' : '1',
    };
  });

  const gEdges = safeEdges
    .map((e) => {
      const a = nodeById[e[0]];
      const b = nodeById[e[1]];
      if (!a || !b) return null;
      const involved = selNodeId === e[0] || selNodeId === e[1];
      const dim = !filterMatch(a, graphFilter) && !filterMatch(b, graphFilter);
      return {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        lx: (a.x + b.x) / 2,
        ly: (a.y + b.y) / 2 - 6,
        label: e[2],
        dash: e[3] ? '4 3' : '0',
        stroke: involved ? '#111110' : '#D5D5D0',
        sw: involved ? '1.5' : '1',
        op: dim ? '.1' : '1',
      };
    })
    .filter(Boolean) as {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    lx: number;
    ly: number;
    label: string;
    dash: string;
    stroke: string;
    sw: string;
    op: string;
  }[];

  return (
    <svg
      viewBox="0 0 900 560"
      style={{
        width: '100%',
        height: 'auto',
        display: 'block',
        fontFamily: "'Chakra Petch', sans-serif",
      }}
    >
      {gEdges.map((e, i) => (
        <g key={`e${i}`} style={{ opacity: e.op as unknown as number }}>
          <line
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={e.stroke}
            strokeWidth={e.sw}
            strokeDasharray={e.dash}
          />
          <text
            x={e.lx}
            y={e.ly}
            textAnchor="middle"
            style={{ fontSize: '9.5px', fill: '#8B8B85' }}
          >
            {e.label}
          </text>
        </g>
      ))}
      {gNodes.map((n) => (
        <g
          key={n.id}
          onClick={() => onSelectNode(n.id)}
          style={{ cursor: 'pointer', opacity: n.op as unknown as number }}
        >
          <circle
            cx={n.x}
            cy={n.y}
            r={n.ring}
            fill="none"
            stroke="#111110"
            strokeWidth={1}
            opacity={n.ringOp as unknown as number}
          />
          {n.isRect ? (
            <rect
              x={n.rx}
              y={n.ry}
              width={16}
              height={16}
              fill="#fff"
              stroke={n.stroke}
              strokeWidth={n.sw}
            />
          ) : (
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={n.fill}
              stroke={n.stroke}
              strokeWidth={n.sw}
              strokeDasharray={n.dash}
            />
          )}
          <text
            x={n.x}
            y={n.labelY}
            textAnchor="middle"
            style={{
              fontSize: '11px',
              fill: '#3B3B36',
              fontWeight: n.labelWeight,
            }}
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
