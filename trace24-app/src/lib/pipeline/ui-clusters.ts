/** UI clusters for GraphScreen layer 「กลุ่มความสัมพันธ์」. */

export type UiCluster = {
  name: string;
  sub: string;
  comp: string;
  signals: number;
  sevKey: string;
  node: string;
};

type ContractorLike = {
  name?: string;
  contracts?: number;
  total?: string;
  directors?: unknown[];
  related?: unknown[];
  risks?: unknown[];
};

type RelatedMatchLike = {
  ruleId?: string;
  matchType?: string;
  severity?: string;
  explanation?: string;
  companyId?: string;
  companyName?: string;
  otherCompanyId?: string;
  otherCompanyName?: string;
  personName?: string;
  executiveName?: string;
};

export function buildUiClusters(input: {
  contractors: Record<string, ContractorLike>;
  relatedMatches?: RelatedMatchLike[];
}): UiCluster[] {
  const clusters: UiCluster[] = [];
  const matches = input.relatedMatches || [];
  const contractors = input.contractors || {};

  for (const m of matches.slice(0, 10)) {
    const node =
      (m.companyId && contractors[m.companyId] && m.companyId) ||
      (m.otherCompanyId && contractors[m.otherCompanyId] && m.otherCompanyId) ||
      'muni';
    const parts = [
      m.companyName || m.otherCompanyName ? `${m.otherCompanyName ? 2 : 1} นิติบุคคล` : null,
      m.personName || m.executiveName ? '1 บุคคล' : null,
    ].filter(Boolean);
    clusters.push({
      name:
        m.ruleId === 'R13'
          ? `เชื่อมโยงผู้บริหาร — ${m.companyName || m.personName || 'นิติบุคคล'}`
          : `กลุ่มความสัมพันธ์ — ${m.companyName || m.ruleId || 'ตรวจพบ'}`,
      sub: m.explanation || 'สัญญาณจากทำเนียบ/กรรมการ (รอยืนยัน)',
      comp: parts.join(' · ') || '—',
      signals: 1,
      sevKey: m.severity || 'Medium',
      node,
    });
  }

  if (clusters.length > 0) return clusters;

  // Fallback: concentration groups from top winners (not related-party proof)
  const ranked = Object.entries(contractors)
    .sort((a, b) => (b[1].contracts || 0) - (a[1].contracts || 0))
    .slice(0, 6);

  for (const [id, co] of ranked) {
    const n = co.contracts || 0;
    if (n <= 0) continue;
    const dirN = Array.isArray(co.directors) ? co.directors.length : 0;
    clusters.push({
      name: `กลุ่มผู้รับจ้าง — ${co.name || id}`,
      sub:
        dirN > 0
          ? `${n} สัญญา · มูลค่า ${co.total || '—'} · มีกรรมการ ${dirN} รายในแพ็ก`
          : `${n} สัญญา · มูลค่า ${co.total || '—'} — ยังไม่มีสัญญาณกรรมการร่วม (รอทำเนียบ/DBD)`,
      comp: `1 นิติบุคคล · ${n} โครงการ`,
      signals: 0,
      sevKey: n >= 5 ? 'Medium' : 'Low',
      node: id,
    });
  }

  return clusters;
}
