/** Thai government / public APIs — catalog for TRACE24 integration decisions */

export type GovApiAccess = 'public_register' | 'public_open' | 'agency_only' | 'unstable';

export type GovApiFit =
  | 'core' // directly useful for TRACE24 integrity / spending
  | 'adjacent' // useful context (macro, weather, transport)
  | 'not_fit'; // identity / G2G / out of scope

export type GovApiEntry = {
  id: string;
  nameTh: string;
  nameEn: string;
  owner: string;
  url: string;
  docsUrl?: string;
  access: GovApiAccess;
  fit: GovApiFit;
  why: string;
  auth: string;
  statusNote: string;
  envKeys?: string[];
};

export const THAI_GOV_API_CATALOG: GovApiEntry[] = [
  {
    id: 'opend-data',
    nameTh: 'Open D / Data API ศูนย์ข้อมูลเปิดภาครัฐ',
    nameEn: 'Open Government Data API',
    owner: 'สพร. (DGA)',
    url: 'https://opend.data.go.th',
    docsUrl: 'https://opend.data.go.th/register_api/signup.php',
    access: 'public_register',
    fit: 'core',
    why: 'แหล่งสัญญา e-GP เมื่อ endpoint ใช้ได้ — มี timeout; ถ้าล่ม/ค้างระบบสกัดจากประกาศโดยตรง',
    auth: 'api-key หลังสมัครฟรี',
    statusNote: 'optional · timeout 8s · fallback = e-GP announcement HTML',
    envKeys: ['OPEND_API_KEY'],
  },
  {
    id: 'data-go-th-ckan',
    nameTh: 'data.go.th (CKAN catalog)',
    nameEn: 'Open Data Catalog CKAN API',
    owner: 'สพร. (DGA)',
    url: 'https://data.go.th',
    docsUrl: 'https://data.go.th/api/3',
    access: 'public_open',
    fit: 'core',
    why: 'ค้นหาชุดงบประมาณ / จัดซื้อ + datastore egp-contact สำหรับสัญญาหน่วยงาน',
    auth: 'ไม่ต้อง key',
    statusNote: 'live — package_search + datastore_search',
  },
  {
    id: 'govspending-web',
    nameTh: 'ภาษีไปไหน? (Thailand Government Spending)',
    nameEn: 'Government Spending portal',
    owner: 'สพร. / กรมบัญชีกลาง ฯลฯ',
    url: 'https://govspending.data.go.th',
    docsUrl: 'https://data.go.th/dataset/egp-contact-2568',
    access: 'public_open',
    fit: 'core',
    why: 'แหล่งสัญญา e-GP ที่เผยแพร่ผ่าน data.go.th (egp-contact-*) — ใช้ enrich ผู้ชนะ/ราคา',
    auth: 'ไม่ต้อง key (CKAN datastore)',
    statusNote: 'live ผ่าน CKAN datastore · egp-contact-2568 ราคาใช้ได้ / คอลัมน์ผู้ชนะเพี้ยน — ใช้ cgd-contract ปีเก่าเสริม',
  },
  {
    id: 'egp-announce-html',
    nameTh: 'ประกาศ e-GP / เว็บหน่วยงาน',
    nameEn: 'e-GP announcement HTML + municipal portals',
    owner: 'กรมบัญชีกลาง + อปท.',
    url: 'https://process.gprocurement.go.th/',
    access: 'public_open',
    fit: 'core',
    why: 'วิธีสำรองหลักเมื่อ Open D ล่ม/ค้าง — สกัดผู้ชนะ/ราคาจาก ShowHTMLFile โดยตรง',
    auth: 'ไม่ต้อง key',
    statusNote: 'live fallback ใน fetch-real-data + /api/agencies/[id]/enrich',
  },
  {
    id: 'egpdepartment',
    nameTh: 'รายชื่อหน่วยจัดซื้อ (EGP Department)',
    nameEn: 'e-GP procurement unit registry',
    owner: 'กรมบัญชีกลาง / data.go.th',
    url: 'https://data.go.th/dataset/egpdepartment',
    docsUrl: 'https://data.go.th/dataset/egpdepartment',
    access: 'public_open',
    fit: 'core',
    why: 'ทะเบียนกลางรหัสหน่วยงาน + ชื่อ + สังกัด (~55k) สำหรับค้นหาเทศบาล/อปท./ส่วนราชการ',
    auth: 'ไม่ต้อง key (CSV / CKAN)',
    statusNote: 'ใช้สร้าง data/catalog/agencies.json.gz ผ่าน npm run build-agency-catalog',
  },
  {
    id: 'bot-api',
    nameTh: 'ธนาคารแห่งประเทศไทย API',
    nameEn: 'Bank of Thailand API',
    owner: 'ธปท.',
    url: 'https://apiportal.bot.or.th/bot/public/',
    docsUrl: 'https://portal.api.bot.or.th',
    access: 'public_register',
    fit: 'adjacent',
    why: 'อัตราแลกเปลี่ยน / ดอกเบี้ย สำหรับบริบทมูลค่าสัญญาและเงินเฟ้อ',
    auth: 'สมัคร → BOT API token',
    statusNote: 'เปิดให้ประชาชน/นักพัฒนาสมัครได้',
    envKeys: ['BOT_API_TOKEN'],
  },
  {
    id: 'tmd-api',
    nameTh: 'กรมอุตุนิยมวิทยา API',
    nameEn: 'Thai Meteorological Department API',
    owner: 'กรมอุตุฯ',
    url: 'https://data.tmd.go.th/api/index1.php',
    access: 'public_open',
    fit: 'adjacent',
    why: 'อากาศ/ภัยพิบัติ — บริบทโครงการก่อสร้างนอกบ้าน แต่ไม่ใช่แกน integrity',
    auth: 'ดูเงื่อนไขในหน้า TMD',
    statusNote: 'API สาธารณะ',
  },
  {
    id: 'royalrain-radar',
    nameTh: 'เรดาร์ฝนหลวง Open Data',
    nameEn: 'Royal Rainmaking radar open data',
    owner: 'กรมฝนหลวงฯ',
    url: 'https://opendata.royalrain.go.th',
    access: 'public_open',
    fit: 'adjacent',
    why: 'ข้อมูลเรดาร์ — นอกแกนจัดซื้อจัดจ้าง',
    auth: 'เปิดสาธารณะตามเอกสาร',
    statusNote: 'มี API เอกสารสาธารณะ',
  },
  {
    id: 'mot-catalog',
    nameTh: 'บัญชีข้อมูลคมนาคม',
    nameEn: 'MOT Data Catalog',
    owner: 'กระทรวงคมนาคม',
    url: 'https://datagov.mot.go.th',
    access: 'public_open',
    fit: 'adjacent',
    why: 'โครงการคมนาคม / โครงข่าย — เสริมการวิเคราะห์โครงสร้างพื้นฐาน',
    auth: 'catalog + JSON/XML/WMS/WFS',
    statusNote: 'เปิดสาธารณะ',
  },
  {
    id: 'gdx-egov',
    nameTh: 'Government API Gateway / GDX',
    nameEn: 'api.egov.go.th (DOPA, DBD linkage, Laser Code)',
    owner: 'สพร. + เจ้าของข้อมูล',
    url: 'https://api.egov.go.th',
    docsUrl: 'https://kb.dga.or.th/gdx/2gettingstarted/',
    access: 'agency_only',
    fit: 'not_fit',
    why: 'ทะเบียนราษฎร์ / นิติบุคคลเต็ม / Laser Code — ต้องเป็นหน่วยงานรัฐที่ได้รับอนุมัติ',
    auth: 'Consumer-Key / Secret ผ่าน สพร.',
    statusNote: 'บุคคลทั่วไปสมัครเองไม่ได้',
  },
  {
    id: 'dbd-direct',
    nameTh: 'กรมพัฒนาธุรกิจการค้า (ข้อมูลนิติบุคคลเต็ม)',
    nameEn: 'DBD company registry (full)',
    owner: 'DBD',
    url: 'https://data.dbd.go.th/',
    access: 'agency_only',
    fit: 'core',
    why: 'กรรมการ / ที่อยู่ / ผู้ถือหุ้น — สำคัญต่อ entity resolution แต่ API เต็มมักผ่าน GDX',
    auth: 'หน่วยงาน / เงื่อนไขเจ้าของข้อมูล',
    statusNote: 'เว็บค้นหาเปิดได้บางส่วน; API เต็มไม่ใช่ self-serve',
  },
];

export function catalogByFit(fit?: GovApiFit) {
  return fit ? THAI_GOV_API_CATALOG.filter((e) => e.fit === fit) : THAI_GOV_API_CATALOG;
}

export function catalogForTrace24() {
  return {
    generatedAt: new Date().toISOString(),
    core: catalogByFit('core'),
    adjacent: catalogByFit('adjacent'),
    notFit: catalogByFit('not_fit'),
    mcpNote:
      'ยังไม่มี official Thai Government MCP — ใช้ REST clients ใน src/lib/gov-apis หรือห่อเป็น MCP เอง',
    envTemplate: {
      OPEND_API_KEY: 'from opend.data.go.th',
      BOT_API_TOKEN: 'from portal.api.bot.or.th (optional)',
    },
  };
}
