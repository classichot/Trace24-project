import type { AgencyRecord } from '@/lib/agencies';
import { govSpendingPortalSearchUrl } from '@/lib/gov-apis/govspending';

/** Minimal live dataset for catalog agencies without a cached report yet. */
export function buildCatalogStubReport(agency: AgencyRecord) {
  const keyword = agency.th;
  return {
    agency: {
      ...agency,
      dataUrl: agency.web ? `https://www.${agency.web}/` : 'https://data.go.th/dataset/egpdepartment',
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
      graphTitle: 'เครือข่าย (รอข้อมูลสัญญา)',
      graphNote: 'ยังไม่มีสัญญาในแคช',
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
    caseFile: {
      id: `case-${agency.id}`,
      title: agency.th,
      status: 'ทะเบียนเท่านั้น',
    },
    crawl: [],
    queue: [],
    entities: [],
    review: [],
    graph: { nodes: [], links: [] },
    details: {
      muni: {
        title: agency.th,
        sub: agency.loc,
        body: `รหัสหน่วยงาน ${agency.code}`,
      },
    },
  };
}
