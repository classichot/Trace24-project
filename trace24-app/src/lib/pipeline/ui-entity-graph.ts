/**
 * UI entity graph for GraphScreen (nodes + edges tuples).
 * Separate from TemporalGraph used by investigate/RAG.
 */

type UiNode = { id: string; type: string; x: number; y: number; label: string };
type UiEdge = [string, string, string, boolean];
type UiDetail = {
  typeLabel: string;
  label: string;
  sub: string;
  facts: string[];
  docs: string[];
  link?: string | null;
  target?: string;
};

function shortLabel(name: string, max = 18) {
  const s = String(name || '').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function truncate(s: string, max = 72) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

type ProjectLike = {
  code?: string;
  name?: string;
  winner?: string | null;
  winnerId?: string | null;
  award?: string;
  method?: string;
  year?: string;
  alerts?: unknown[];
};

type ContractorLike = {
  name?: string;
  reg?: string;
  contracts?: number;
  total?: string;
  shareNum?: string;
};

type RelatedMatch = {
  id: string;
  ruleId?: string;
  companyId?: string;
  companyName?: string;
  personName?: string;
  executiveName?: string;
  matchType?: string;
  explanation?: string;
};

export function buildUiEntityGraph(input: {
  agency: { th: string; loc?: string; code?: string; tshort?: string };
  projects: Record<string, ProjectLike>;
  contractors: Record<string, ContractorLike>;
  relatedMatches?: RelatedMatch[];
  preferProjectIds?: string[];
}) {
  const { agency, projects, contractors, relatedMatches = [], preferProjectIds } = input;
  const nodes: UiNode[] = [];
  const edges: UiEdge[] = [];
  const details: Record<string, UiDetail> = {};

  const rankedProjectIds =
    preferProjectIds?.filter((id) => projects[id]) ||
    Object.entries(projects)
      .sort((a, b) => {
        const aw = a[1].winner || a[1].winnerId ? 1 : 0;
        const bw = b[1].winner || b[1].winnerId ? 1 : 0;
        return bw - aw;
      })
      .map(([id]) => id);
  const projectIds = rankedProjectIds.slice(0, 8);

  const linkedContractorIds = new Set<string>();
  for (const pid of projectIds) {
    const p = projects[pid];
    if (p.winner && contractors[p.winner]) linkedContractorIds.add(p.winner);
    if (p.winnerId && contractors[p.winnerId]) linkedContractorIds.add(p.winnerId);
  }
  const contractorIds = [
    ...linkedContractorIds,
    ...Object.entries(contractors)
      .sort((a, b) => (b[1].contracts || 0) - (a[1].contracts || 0))
      .map(([id]) => id)
      .filter((id) => !linkedContractorIds.has(id)),
  ].slice(0, 8);

  nodes.push({
    id: 'muni',
    type: 'muni',
    x: 140,
    y: 280,
    label: shortLabel(agency.th.replace(/^เทศบาลตำบล|^เทศบาลเมือง|^เทศบาลนคร/, 'ทต.')),
  });
  details.muni = {
    typeLabel: agency.tshort || 'หน่วยงาน',
    label: agency.th,
    sub: agency.loc || `รหัส ${agency.code || '—'}`,
    facts: [
      `โครงการในรายงาน ${Object.keys(projects).length} รายการ`,
      `ผู้รับจ้าง ${Object.keys(contractors).length} ราย`,
      relatedMatches.length
        ? `สัญญาณความสัมพันธ์ ${relatedMatches.length} รายการ`
        : 'ยังไม่มีสัญญาณความสัมพันธ์จากทำเนียบ/กรรมการ',
    ],
    docs: ['ทะเบียน e-GP', 'สัญญา data.go.th'],
    link: null,
  };

  projectIds.forEach((pid, i) => {
    const p = projects[pid];
    const y = 80 + i * ((480 - 80) / Math.max(1, projectIds.length - 1 || 1));
    nodes.push({
      id: pid,
      type: 'project',
      x: 340,
      y: projectIds.length === 1 ? 280 : y,
      label: p.code || pid,
    });
    edges.push(['muni', pid, 'จัดจ้าง', false]);
    details[pid] = {
      typeLabel: 'โครงการ',
      label: `${p.code || pid} · ${truncate(p.name || '', 48)}`,
      sub: [p.award, p.method, p.year].filter(Boolean).join(' · ') || '—',
      facts: [
        truncate(p.name || '—', 100),
        p.winner && contractors[p.winner]
          ? `ผู้ชนะ: ${contractors[p.winner].name}`
          : p.winnerId && contractors[p.winnerId]
            ? `ผู้ชนะ: ${contractors[p.winnerId].name}`
            : 'ยังไม่ทราบผู้ชนะจากประกาศ',
      ],
      docs: p.code ? [`e-GP ${p.code}`] : [],
      link: 'project',
      target: pid,
    };
    if (p.winner && contractors[p.winner]) {
      edges.push([pid, p.winner, 'ผู้ชนะ', false]);
    } else if (p.winnerId && contractors[p.winnerId]) {
      edges.push([pid, p.winnerId, 'ผู้ชนะ', false]);
    }
  });

  contractorIds.forEach((cid, i) => {
    const c = contractors[cid];
    const y = 100 + i * ((460 - 100) / Math.max(1, contractorIds.length - 1 || 1));
    nodes.push({
      id: cid,
      type: 'company',
      x: 580,
      y: contractorIds.length === 1 ? 280 : y,
      label: shortLabel(c.name || cid, 20),
    });
    details[cid] = {
      typeLabel: 'ผู้รับจ้าง',
      label: c.name || cid,
      sub: c.reg && c.reg !== '—' ? `เลขทะเบียน ${c.reg}` : 'รอเลขทะเบียน',
      facts: [
        `สัญญา ${c.contracts || 0} รายการ`,
        c.total ? `มูลค่ารวม ${c.total}` : '—',
        c.shareNum ? `สัดส่วน ${c.shareNum}` : '',
      ].filter(Boolean),
      docs: ['ประกาศผู้ชนะ / สัญญา'],
      link: 'contractor',
      target: cid,
    };
    // If no project→winner edge exists for this company, still link to agency
    const linked = edges.some((e) => e[0] === cid || e[1] === cid);
    if (!linked) {
      edges.push(['muni', cid, 'ผู้รับจ้าง', false]);
    }
  });

  // Related-party person / executive links when available
  let personIdx = 0;
  for (const m of relatedMatches.slice(0, 6)) {
    const pid = `rp${++personIdx}`;
    const label = m.executiveName || m.personName || 'บุคคล';
    nodes.push({
      id: pid,
      type: 'person',
      x: 780,
      y: 80 + (personIdx - 1) * 70,
      label: shortLabel(label, 18),
    });
    details[pid] = {
      typeLabel: m.ruleId ? `${m.ruleId} · บุคคล` : 'บุคคล',
      label,
      sub: m.matchType || 'ความสัมพันธ์',
      facts: [m.explanation || 'พบความเชื่อมโยงจากทำเนียบ/กรรมการ'].filter(Boolean),
      docs: [],
      link: null,
    };
    if (m.companyId && contractors[m.companyId]) {
      edges.push([m.companyId, pid, m.ruleId || 'เกี่ยวข้อง', true]);
    } else {
      edges.push(['muni', pid, m.ruleId || 'เกี่ยวข้อง', true]);
    }
  }

  const edgeCount = edges.length;
  return {
    nodes,
    edges,
    details,
    meta: {
      graphTitle: edgeCount
        ? `เครือข่ายจัดซื้อ · ${nodes.length} โหนด`
        : 'เครือข่าย (รอข้อมูลสัญญา)',
      graphNote: edgeCount
        ? `แสดง ${edgeCount} ความสัมพันธ์จากสัญญาในรายงาน · ทุกเส้นเชื่อมอ้างอิงข้อมูลที่ดึงได้`
        : 'ยังไม่มีสัญญาในแคช — กราฟจะเติมเมื่อมีโครงการ/ผู้ชนะ',
    },
  };
}
