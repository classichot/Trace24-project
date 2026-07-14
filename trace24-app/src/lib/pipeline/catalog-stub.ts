import type { AgencyRecord } from '@/lib/agencies';
import { websiteForAgency } from '@/lib/agency-websites';
import { govSpendingPortalSearchUrl } from '@/lib/gov-apis/govspending';
import { buildUiClusters } from './ui-clusters';
import { buildUiEntityGraph } from './ui-entity-graph';

/** Minimal live dataset for catalog agencies without a cached report yet. */
export function buildCatalogStubReport(agency: AgencyRecord) {
  const withWeb = {
    ...agency,
    web: agency.web || websiteForAgency(agency.id) || '',
  };
  const keyword = withWeb.th;
  const uiGraph = buildUiEntityGraph({
    agency: withWeb,
    projects: {},
    contractors: {},
    relatedMatches: [],
  });
  return {
    agency: {
      ...withWeb,
      dataUrl: withWeb.web
        ? `https://www.${withWeb.web.replace(/^www\./, '')}/`
        : 'https://data.go.th/dataset/egpdepartment',
      egpKeyword: keyword,
    },
    meta: {
      source: 'egpdepartment-catalog',
      fetchedAt: new Date().toISOString(),
      scanSummary: `อยู่ในทะเบียนหน่วยจัดซื้อ e-GP · รหัส ${agency.code} · ยังไม่ได้ดึงสัญญาจากภาษีไปไหน`,
      dataPct: '—',
      dataGapNote: 'เลือกหน่วยงานนี้จากทะเบียนกลางแล้ว — รัน build-from-govspending หรือ enrich เพื่อดึงสัญญา',
      priorityNote: 'ยังไม่มีโครงการในแคช',
      concNote: 'ข้อมูลทะเบียนจาก data.go.th / egpdepartment',
      vendorsTitle: 'ผู้รับจ้าง',
      graphTitle: uiGraph.meta.graphTitle,
      graphNote: uiGraph.meta.graphNote,
      catalogOnly: true,
    },
    stats: [
      { label: 'รหัสหน่วยงาน', value: String(agency.code || '—'), sub: 'e-GP dept code' },
      { label: 'ประเภท', value: agency.tshort, sub: agency.type },
      { label: 'จังหวัด', value: agency.prov || '—', sub: agency.loc },
      { label: 'สัญญาในแคช', value: '0', sub: 'ยังไม่ได้ดึง' },
      { label: 'สถานะ', value: 'ทะเบียน', sub: 'พร้อมค้นหา' },
    ],
    years: [],
    methods: [],
    riskCats: [],
    alerts: [],
    projects: {},
    contractors: {},
    sources: [
      {
        url: 'https://data.go.th/dataset/egpdepartment',
        type: 'data.go.th · รายชื่อหน่วยจัดซื้อ (egpdepartment)',
        status: 'ทะเบียนกลาง',
        ok: true,
        last: 'แคตตาล็อก TRACE24',
        docs: agency.code,
      },
      {
        url: govSpendingPortalSearchUrl(keyword),
        type: 'ภาษีไปไหน? (ค้นหาสัญญา)',
        status: 'ลิงก์สาธารณะ',
        ok: true,
        last: '—',
        docs: keyword,
      },
    ],
    stages: [
      ['ระบุหน่วยงานสำเร็จ', `รหัส ${agency.code}`],
      ['พบในทะเบียน e-GP', agency.tshort],
      ['รอการดึงสัญญา', 'data.go.th / ภาษีไปไหน'],
      ['รายงานเบื้องต้นพร้อม', 'ข้อมูลทะเบียน'],
    ],
    def: {
      project: '',
      contractor: '',
      node: 'muni',
    },
    priorityOrder: [],
    topContractors: [],
    executives: [],
    relatedParty: {
      matches: [],
      coverage: 'ยังไม่มีทำเนียบผู้บริหารและกรรมการ — เพิ่มที่แท็บความเชื่อมโยง',
    },
    caseFile: {
      id: `case-${agency.id}`,
      title: agency.th,
      summary: `หน่วยงาน「${agency.th}」อยู่ในทะเบียนหน่วยจัดซื้อ e-GP (รหัส ${agency.code}) — ยังไม่มีสัญญาในแคช`,
      status: 'ทะเบียนเท่านั้น',
      opened: 'เปิดจากทะเบียน e-GP',
      owner: 'รอมอบหมายผู้ตรวจ',
      signals: 'คะแนนความเสี่ยงใช้จัดลำดับการตรวจเท่านั้น ไม่ใช่ข้อกล่าวหา',
      evidence: ['https://data.go.th/dataset/egpdepartment'],
      questions: [] as [string, string][],
      timeline: [] as [string, string, string][],
      parties: [] as [string, string, boolean][],
      money: [] as [string, string, boolean][],
      notes: [] as [string, string][],
    },
    crawl: [],
    queue: [],
    queueStats: [] as { n: string; label: string }[],
    queueRows: [] as {
      id: string;
      title: string;
      type: string;
      fmt: string;
      status: string;
      ok: boolean | null;
    }[],
    entities: [],
    erRows: [] as { id: string; a: string; b: string; sim: string; ev: string[] }[],
    review: [],
    adminReviewRows: [] as {
      key: string;
      code: string;
      title: string;
      sevKey: string;
      def: string;
    }[],
    graph: {
      nodes: uiGraph.nodes,
      edges: uiGraph.edges,
      details: uiGraph.details,
    },
    details: uiGraph.details,
    clusters: buildUiClusters({ contractors: {}, relatedMatches: [] }),
  };
}
