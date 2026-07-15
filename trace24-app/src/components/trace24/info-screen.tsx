'use client';

import type { CSSProperties } from 'react';
import { useTrace24, type Page } from '@/context/trace24-context';
import { Footer, Logo, inputStyle, selectStyle } from './ui';

const INFO_TABS: { page: Page; label: string }[] = [
  { page: 'method', label: 'ระเบียบวิธี' },
  { page: 'sources', label: 'แหล่งข้อมูล' },
  { page: 'corrections', label: 'ขอแก้ไขข้อมูล' },
  { page: 'about', label: 'เกี่ยวกับเรา' },
];

const WORKFLOW_STEPS = [
  {
    n: '01',
    title: 'ระบุหน่วยงาน',
    desc: 'จับคู่จากชื่อทางการ ประเภท จังหวัด อำเภอ รหัสหน่วยงาน และการสะกดแบบอื่น — ไม่ใช้ AI คาดเดาหน่วยงาน',
  },
  {
    n: '02',
    title: 'ค้นหาแหล่งข้อมูลทางการ',
    desc: 'หน้าจัดซื้อจัดจ้าง งบประมาณ และทำเนียบผู้บริหารทุกระดับบนเว็บไซต์หน่วยงาน คำสั่งแต่งตั้ง และประกาศในระบบ e-GP',
  },
  {
    n: '03',
    title: 'เก็บและดาวน์โหลดเอกสาร',
    desc: 'บันทึก URL ต้นทาง เวลาดึงข้อมูล และค่าแฮชของทุกไฟล์ — เก็บต้นฉบับถาวร',
  },
  {
    n: '04',
    title: 'แยกวิเคราะห์และ OCR',
    desc: 'สกัดข้อความ PDF โดยตรงก่อน จึงใช้ OCR ภาษาไทยสำหรับเอกสารสแกน — หน้าที่ความเชื่อมั่นต่ำส่งให้เจ้าหน้าที่ตรวจ',
  },
  {
    n: '05',
    title: 'สกัดข้อเท็จจริงเชิงโครงสร้าง',
    desc: 'โครงการ วงเงิน ราคากลาง ราคาที่ตกลง ผู้ชนะ วันที่ และวิธีจัดซื้อ — ทุกค่ามีค่าความเชื่อมั่นและอ้างอิงถึงหน้าเอกสารต้นทาง',
  },
  {
    n: '06',
    title: 'จับคู่นิติบุคคลและสร้างกราฟ',
    desc: 'รวมการสะกดชื่อบริษัทที่ต่างกันด้วยเลขทะเบียน ที่อยู่ กรรมการ และผู้ถือหุ้น พร้อมเชื่อมทำเนียบผู้บริหารทุกระดับของหน่วยงานเข้ากราฟ เพื่อตรวจความเชื่อมโยงกับผู้ชนะการประมูล — การจับคู่ที่ไม่แน่นอนจะไม่ถูกรวมอัตโนมัติ',
  },
  {
    n: '07',
    title: 'ประมวลกฎความเสี่ยงและเปรียบเทียบ',
    desc: `รันกฎ R1–R26 จัดกลุ่มใน 5 มิติ (บิดเบือนโครงการ · ล็อก TOR · ฮั้วประมูล · ผลประโยชน์ทับซ้อน · ทำสัญญา/ตรวจรับ) เทียบราคาตลาดและกลุ่มหน่วยงาน — AI ช่วยอ่านเอกสาร แต่ไม่ให้คะแนนทุจริต`,
  },
];

type RiskDimId = 'PM' | 'TOR' | 'BID' | 'COI' | 'EXE' | 'DATA';

const RISK_RULES: {
  id: string;
  text: string;
  cat: string;
  dim: RiskDimId;
  needs?: string;
}[] = [
  { id: 'R1', text: 'ผู้ชนะรายเดิมซ้ำ / ชนะเกิน 5 สัญญาต่อปีจากหน่วยงานเดียว', cat: 'การแข่งขัน', dim: 'BID' },
  { id: 'R2', text: 'ความกระจุกตัวของผู้รับจ้างสูง / ผู้เสนอราคาน้อยราย', cat: 'การแข่งขัน', dim: 'BID' },
  { id: 'R3', text: 'ใช้วิธีเฉพาะเจาะจงซ้ำผิดปกติ', cat: 'กระบวนการ', dim: 'PM' },
  { id: 'R4', text: 'ราคาที่ตกลงใกล้เพดานงบประมาณมาก (proxy ราคากลาง)', cat: 'ราคา', dim: 'BID' },
  { id: 'R5', text: 'นามสกุล/กรรมการหรือที่อยู่จดทะเบียนร่วมระหว่างผู้รับจ้าง', cat: 'ความสัมพันธ์', dim: 'COI' },
  { id: 'R6', text: 'อาจมีการแบ่งซื้อแบ่งจ้าง / ซอยสัญญา (ผู้ชนะเดียว · ชื่อคล้าย)', cat: 'กระบวนการ', dim: 'PM' },
  { id: 'R7', text: 'โครงการกระจุกตัวใต้เกณฑ์วงเงินจัดซื้อ', cat: 'กระบวนการ', dim: 'PM' },
  { id: 'R8', text: 'คำบรรยายโครงการซ้ำหรือคล้ายกันผิดปกติ', cat: 'กระบวนการ', dim: 'TOR' },
  { id: 'R9', text: 'ชื่อ/คำบรรยายโครงการซ้ำแบบแม่แบบ (proxy TOR)', cat: 'กระบวนการ', dim: 'TOR' },
  { id: 'R10', text: 'ราคาสูงกว่า P75 / ค่ากลางกลุ่มเปรียบเทียบตลาด', cat: 'ราคา', dim: 'BID' },
  {
    id: 'R11',
    text: 'รายละเอียดไม่ครบจนตรวจ/เทียบลำบาก — สันนิษฐานปิดบังข้อมูลไว้ก่อน',
    cat: 'การเปิดเผยข้อมูล',
    dim: 'DATA',
  },
  { id: 'R12', text: 'ตัวเลขหรือวันที่ในระเบียนขัดแย้งกัน', cat: 'คุณภาพข้อมูล', dim: 'DATA' },
  { id: 'R13', text: 'นามสกุลเจ้าหน้าที่หน่วยงานตรงกับกรรมการหรือผู้ถือหุ้นของผู้ชนะ (ชื่อเต็มยกระดับ)', cat: 'ความสัมพันธ์', dim: 'COI' },
  { id: 'R14', text: 'วิธีคัดเลือก/เฉพาะเจาะจงกระจุกผู้ชนะรายเดียวในปีงบ', cat: 'วิธีจัดซื้อ', dim: 'PM' },
  { id: 'R15', text: 'ผู้ชนะรายเดียวถือครองสัดส่วนมูลค่าสูงต่อปีงบ (≥40%)', cat: 'มูลค่า', dim: 'BID' },
  { id: 'R16', text: 'ชนะงานหมวดเดียวกันซ้ำข้ามหลายปีงบ', cat: 'ผู้ชนะซ้ำ', dim: 'BID' },
  { id: 'R17', text: 'สัญญาประกาศกระจุกช่วงปลายปีงบ (ส.ค.–ก.ย.)', cat: 'ปลายปีงบ', dim: 'PM' },
  {
    id: 'R18',
    text: 'บริษัทใหม่/ก่อตั้งไม่นานแล้วยอดชนะสูง (DataForThai หรือปีแรกในแคช)',
    cat: 'ผู้รับจ้างใหม่',
    dim: 'COI',
    needs: 'วันจดทะเบียน',
  },
  {
    id: 'R19',
    text: 'ผู้รับจ้างหลายรายจดทะเบียนที่อยู่เดียวกันชนะรวมเกิน 5 สัญญา',
    cat: 'ที่อยู่ร่วม',
    dim: 'COI',
    needs: 'ที่อยู่ DataForThai',
  },
  {
    id: 'R20',
    text: 'ชนะงานอบรม/ประชาสัมพันธ์/จัดงานซ้ำ (โครงการวัดผลยาก)',
    cat: 'โครงการอ่อน',
    dim: 'PM',
  },
  {
    id: 'R21',
    text: 'ชื่อโครงการคล้ายกันข้ามปีงบ (proxy งานซ้ำซ้อนของบ)',
    cat: 'โครงการซ้ำ',
    dim: 'PM',
  },
  {
    id: 'R22',
    text: 'อ้างเร่งด่วน/ฉุกเฉิน/ผู้ขายรายเดียว หรือข้อยกเว้นซ้ำ',
    cat: 'เหตุพิเศษ',
    dim: 'PM',
  },
  {
    id: 'R23',
    text: 'มูลค่างานสูงเทียบทุนจดทะเบียนต่ำ (ศักยภาพไม่สมส่วน)',
    cat: 'ศักยภาพ',
    dim: 'COI',
    needs: 'ทุน DataForThai',
  },
  {
    id: 'R24',
    text: 'ผู้ชนะรายใหญ่สลับอันดับข้ามปีงบ (proxy เวียนกันชนะ)',
    cat: 'เวียนชนะ',
    dim: 'BID',
  },
  {
    id: 'R25',
    text: 'ผู้ชนะรายเดียวได้หลายสัญญาในเดือนประกาศเดียวกัน',
    cat: 'กระจุกรายเดือน',
    dim: 'PM',
  },
  {
    id: 'R26',
    text: 'เว็บหน่วยงานเข้าได้แต่ไม่มีทำเนียบผู้บริหาร/เจ้าหน้าที่ — สันนิษฐานปกปิดหรือถอดข้อมูลไว้ก่อน',
    cat: 'การเปิดเผยข้อมูล',
    dim: 'DATA',
    needs: 'เว็บหน่วยงาน',
  },
  {
    id: 'R-PRICE',
    text: 'ราคา/อัตราต่อหน่วยสูงกว่าค่ากลางตลาด peer ที่คล้ายกัน',
    cat: 'ราคาตลาด',
    dim: 'BID',
  },
  {
    id: 'STAT-BENFORD',
    text: 'การกระจายตัวเลขนำหน้าของราคาผิดปกติ (Benford)',
    cat: 'สถิติ',
    dim: 'DATA',
  },
];

/** 5 มิติความเสี่ยงตามแผนที่ฮั้ว — ใช้จัดกลุ่ม ไม่ใช่ข้อกล่าวหา */
const RISK_SCORE_DIMS: {
  id: RiskDimId;
  th: string;
  en: string;
  text: string;
  deferred?: string;
}[] = [
  {
    id: 'PM',
    th: 'บิดเบือนโครงการและงบ',
    en: 'Project Manipulation',
    text: 'สร้างงบก้อนอ่อน · แบ่งซื้อแบ่งจ้าง · เหตุพิเศษ · ปลายปีงบ · โครงการซ้ำข้ามปี',
  },
  {
    id: 'TOR',
    th: 'ล็อก TOR / คุณสมบัติ',
    en: 'TOR Lock',
    text: 'ชื่อ/คำบรรยายแบบแม่แบบ — proxy จนกว่าจะมีข้อความ TOR เต็ม',
    deferred: 'รอข้อความ TOR + catalog สินค้า เพื่อล็อกยี่ห้อ/ประสบการณ์/MAL',
  },
  {
    id: 'BID',
    th: 'ฮั้วและการแข่งขันแคบ',
    en: 'Bid Collusion',
    text: 'กระจุกผู้ชนะ · เวียนชนะ · ราคาชิดเพดาน · เทียบตลาด',
    deferred: 'รอรายชื่อผู้แพ้ · metadata ไฟล์ · IP เพื่อ cover bidding',
  },
  {
    id: 'COI',
    th: 'ผลประโยชน์ทับซ้อน',
    en: 'Conflict of Interest',
    text: 'กรรมการ/ที่อยู่ร่วม · เชื่อมผู้บริหาร · บริษัทใหม่ · ทุนไม่สมส่วน',
  },
  {
    id: 'EXE',
    th: 'หลังสัญญาและตรวจรับ',
    en: 'Contract Execution',
    text: 'ยังเป็นช่องว่างหลักของระบบ',
    deferred: 'รอ change order · ค่าปรับ · ตรวจรับ · ภาพสถานที่',
  },
];

const RISK_DIM_DATA: {
  id: RiskDimId;
  th: string;
  en: string;
  text: string;
  deferred?: string;
} = {
  id: 'DATA',
  th: 'คุณภาพและการเปิดเผยข้อมูล',
  en: 'Data Quality',
  text: 'รายละเอียดไม่ครบ→สันนิษฐานปิดบัง · วันที่ขัดแย้ง · สถิติราคาผิดปกติ',
};

const CAPABILITIES = [
  {
    title: 'การจับคู่นิติบุคคล',
    sub: 'Entity Resolution',
    desc: 'ชื่อที่เขียนต่างกันเป็นรายเดียวกันหรือไม่ — เช่น "หจก. ป่าไผ่การโยธา" / "ห้างหุ้นส่วนจำกัด ป่าไผ่ การโยธา" + ที่อยู่และกรรมการเดียวกัน',
    tier: 'P0' as const,
    status: 'มีในต้นแบบ',
    statusColor: '#111110',
  },
  {
    title: 'กราฟเหตุการณ์ตามเวลา',
    sub: 'Temporal Event Graph',
    desc: 'อะไรเกิดขึ้น ลำดับใด และความสัมพันธ์ ณ เวลานั้น — เช่น กรรมการเข้ารับตำแหน่งก่อนประกวดราคาไม่นาน และลาออกหลังรับเงิน',
    tier: 'P0' as const,
    status: 'บางส่วน',
    statusColor: '#55554F',
  },
  {
    title: 'ที่มาของหลักฐาน',
    sub: 'Evidence Provenance',
    desc: 'ทุกข้อเท็จจริงมาจากไหน และเปลี่ยนแปลงหรือไม่ — URL ต้นทาง เลขหน้า เวลาดึงข้อมูล แฮชไฟล์ และข้อความต้นฉบับ',
    tier: 'P0' as const,
    status: 'มีในต้นแบบ',
    statusColor: '#111110',
  },
  {
    title: 'กฎสัญญาณเตือน',
    sub: 'Rule / Red-Flag Engine',
    desc: `R1–R26 + R-PRICE / Benford จัดใน 5 มิติตามแผนที่ฮั้ว — แบ่งซื้อแบ่งจ้าง กระจุกมูลค่า ปลายปีงบ ที่อยู่ร่วม บริษัทใหม่ ทุนไม่สมส่วน เวียนชนะ โครงการอ่อน · ปกปิดทำเนียบ — ไม่รวมเป็นคะแนนทุจริตเดียว`,
    tier: 'P0' as const,
    status: 'มีในต้นแบบ',
    statusColor: '#111110',
  },
  {
    title: 'เปรียบเทียบกลุ่มเทียบเคียง',
    sub: 'Peer Benchmarking',
    desc: 'ธุรกรรมต่างจากธุรกรรมลักษณะเดียวกันหรือไม่ — เช่น ค่าก่อสร้างถนนต่อกิโลเมตรสูงกว่าหน่วยงานเทียบเคียง 45%',
    tier: 'P0' as const,
    status: 'มีในต้นแบบ',
    statusColor: '#111110',
  },
  {
    title: 'ตรวจจับความผิดปกติเชิงสถิติ',
    sub: 'Statistical Anomaly Detection',
    desc: 'พฤติกรรมผิดปกติที่ไม่เคยพบมาก่อน — เช่น จัดซื้อฉุกเฉินเพิ่มขึ้นกะทันหัน หรือผู้ขายรายใหม่ได้งานจำนวนมาก',
    tier: 'P1' as const,
    status: 'กำลังพัฒนา',
    statusColor: '#8B8B85',
  },
  {
    title: 'วิทยาการข้อมูลกราฟ',
    sub: 'Graph Data Science',
    desc: 'กลุ่มซ่อนเร้น ตัวกลาง และพฤติกรรมประสานกัน — เช่น วงผู้เสนอราคาที่ผลัดกันชนะการประมูล',
    tier: 'P1' as const,
    status: 'บางส่วน',
    statusColor: '#55554F',
  },
  {
    title: 'การวิเคราะห์กระบวนการ',
    sub: 'Process Mining',
    desc: 'ขั้นตอนเบี่ยงเบนจากกระบวนการจัดซื้อที่ควรเป็น — เช่น อนุมัติก่อนการประเมิน หรือตรวจรับทันทีหลังส่งมอบ',
    tier: 'P1' as const,
    status: 'กำลังพัฒนา',
    statusColor: '#8B8B85',
  },
  {
    title: 'ความคล้ายและนิติวิทยาเอกสาร',
    sub: 'Document Similarity & Forensics',
    desc: 'สเปกที่คัดลอกกัน เอกสารที่ประสานกัน และแม่แบบน่าสงสัย — เช่น TOR ของโครงการที่อ้างว่าไม่เกี่ยวข้องกันเหมือนกันเกือบทั้งหมด',
    tier: 'P1' as const,
    status: 'มีในต้นแบบ',
    statusColor: '#111110',
  },
  {
    title: 'ข่าวกรองภูมิสารสนเทศ',
    sub: 'Geospatial Intelligence',
    desc: 'รูปแบบเชิงพื้นที่และความขัดแย้งทางกายภาพ — เช่น ผู้รับจ้างต่างรายใช้ที่อยู่ติดกัน หรือโครงการซ้อนทับพื้นที่กัน',
    tier: 'P1' as const,
    status: 'กำลังพัฒนา',
    statusColor: '#8B8B85',
  },
  {
    title: 'ข่าวกรองราคาและ BOQ',
    sub: 'Price & BOQ Intelligence',
    desc: 'ราคาแพงเกินจริงและต้นทุนต่อหน่วยผิดปกติ — เช่น คอนกรีต เสาไฟ หรือยานพาหนะ ราคาสูงกว่าช่วงอ้างอิงของภูมิภาค',
    tier: 'P1' as const,
    status: 'บางส่วน',
    statusColor: '#55554F',
  },
  {
    title: 'เครื่องมือสมมติฐานและข้อโต้แย้ง',
    sub: 'Hypothesis & Contradiction Engine',
    desc: 'หลักฐานทั้งที่สนับสนุนและคัดค้านทฤษฎีการสอบสวน — ระบบชี้หลักฐานการฮั้ว พร้อมคำอธิบายโดยสุจริตที่เป็นไปได้เสมอ',
    tier: 'P1' as const,
    status: 'บางส่วน',
    statusColor: '#55554F',
  },
  {
    title: 'พื้นที่ทำงานคดี',
    sub: 'Case Management Workspace',
    desc: 'แปลงสัญญาณเป็นสำนวนพร้อมสอบสวน — ไทม์ไลน์ คู่กรณี เส้นทางเงิน แผนผังหลักฐาน บันทึก และคำถามที่ค้างอยู่',
    tier: 'P1' as const,
    status: 'กำลังพัฒนา',
    statusColor: '#8B8B85',
  },
];

const LIMITATIONS = [
  'ไม่ให้ "คะแนนทุจริต" หรือรวมความเสี่ยงเป็นตัวเลขเดียว',
  'ไม่ประกาศหรือชี้นำว่าบุคคล บริษัท หรือหน่วยงานใดทุจริต',
  'ไม่ใช้ AI เป็นผู้ตัดสินคะแนนความเสี่ยงขั้นสุดท้าย — AI ช่วยอ่านและสกัดข้อมูลเท่านั้น',
  'ไม่ใช้ข้อมูลหลุด ข้อมูลส่วนบุคคลเกินจำเป็น และไม่ข้ามระบบล็อกอินใด ๆ',
  'ไม่สรุปความเป็นเครือญาติจากนามสกุลที่ตรงกันเพียงอย่างเดียว — ความเชื่อมโยงบุคคลทุกรายการต้องมีเอกสารรองรับ หรือถูกทำเครื่องหมาย "รอยืนยัน" ให้เจ้าหน้าที่ตรวจ',
];

const SOURCE_TYPES = [
  {
    title: 'เว็บไซต์หน่วยงานรัฐ',
    desc: 'ประกาศจัดซื้อจัดจ้าง ประกาศผู้ชนะ ราคากลาง TOR แผนจัดซื้อประจำปี ข้อบัญญัติงบประมาณ และสรุปผลรายเดือน (สขร.1) — ครอบคลุมเทศบาล อบต. อำเภอ จังหวัด กระทรวง กรม โรงพยาบาล โรงเรียน หน่วยตำรวจและทหาร',
  },
  {
    title: 'ระบบ e-GP กรมบัญชีกลาง',
    desc: 'ประกาศจัดซื้อจัดจ้างภาครัฐส่วนกลาง ใช้ตรวจทานกับประกาศบนเว็บไซต์หน่วยงาน',
  },
  {
    title: 'ทะเบียนนิติบุคคลและรายชื่อกรรมการ',
    desc: 'ไล่จากแหล่งสาธารณะ DataForThai → Creden → ประกาศ/เอกสารผู้ชนะ e-GP → DBD / บอจ.5 — ใช้จับคู่ชื่อบริษัทและตรวจความสัมพันธ์กับผู้ชนะ · ข้อมูลเป็น draft จากแหล่งสาธารณะ ให้ตรวจสอบกับแหล่งทางการก่อนใช้เป็นหลักฐาน',
  },
  {
    title: 'ทำเนียบผู้บริหารและเจ้าหน้าที่หน่วยงาน',
    desc: 'รายชื่อจากเว็บไซต์ทางการ คำสั่งแต่งตั้ง และราชกิจจานุเบกษา — นายกฯ/รองฯ ปลัด ผอ.กองช่าง ผอ.กองคลัง นายช่าง เจ้าพนักงาน/เจ้าหน้าที่พัสดุและกองต่าง ๆ — ใช้ตรวจความเชื่อมโยงกับกรรมการและผู้ถือหุ้นของผู้ชนะ (ตำแหน่งที่เกี่ยวข้องจัดซื้อจัดจ้างมักอยู่ที่กองช่างและกองคลัง)',
  },
  {
    title: 'ข้อมูลเปิดภาครัฐอื่น ๆ',
    desc: 'ชุดข้อมูลเปิดของหน่วยงานกำกับดูแล ใช้เป็นกลุ่มเปรียบเทียบราคาและความกระจุกตัว',
  },
];

const COLLECTION_PRACTICES = [
  'เข้าถึงเฉพาะหน้าที่เปิดเผยต่อสาธารณะ — ไม่ข้ามระบบล็อกอินหรือมาตรการความปลอดภัยใด ๆ',
  'บันทึก URL ต้นทาง เวลาดึงข้อมูล และค่าแฮชของทุกไฟล์ — เก็บเอกสารต้นฉบับถาวร ไม่แก้ไข',
  'ตรวจแหล่งข้อมูลซ้ำทุก 24 ชั่วโมง — บันทึกเมื่อเอกสารถูกลบหรือลิงก์เสีย',
  'ไม่เก็บข้อมูลส่วนบุคคลเกินกว่าที่ปรากฏในเอกสารราชการสาธารณะ',
];

const NOT_COLLECTED = [
  'ข้อมูลหลุด ข้อมูลจากผู้แจ้งเบาะแส หรือเอกสารภายในที่ไม่เปิดเผย',
  'ข้อมูลธุรกรรมการเงินส่วนบุคคลหรือข้อมูลธนาคาร',
  'ข้อมูลชีวมิติหรือข้อมูลอ่อนไหวตามกฎหมายคุ้มครองข้อมูลส่วนบุคคล',
];

const CORR_PROCESS = [
  {
    n: '01',
    bold: 'ยื่นคำขอ',
    rest: ' — ระบุหน้าหรือเอกสารที่เกี่ยวข้อง และข้อมูลที่เห็นว่าไม่ถูกต้อง',
  },
  {
    n: '02',
    bold: 'ยืนยันรับคำขอภายใน 7 วัน',
    rest: ' — พร้อมหมายเลขอ้างอิงสำหรับติดตาม',
  },
  {
    n: '03',
    bold: 'ตรวจกับเอกสารต้นทาง',
    rest: ' — เจ้าหน้าที่เทียบคำขอกับเอกสารต้นฉบับและข้อมูลที่สกัดได้',
  },
  {
    n: '04',
    bold: 'แจ้งผลและบันทึกสาธารณะ',
    rest: ' — แก้ไข เพิ่มหมายเหตุ หรือคงเดิมพร้อมคำอธิบาย — ทุกผลถูกบันทึกในทะเบียนการแก้ไขที่เปิดเผย',
  },
];

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
};

function TierBadge({ tier }: { tier: 'P0' | 'P1' }) {
  const isP0 = tier === 'P0';
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: '.06em',
        padding: '3px 7px',
        border: `1px solid ${isP0 ? '#111110' : '#C9C9C4'}`,
        color: isP0 ? '#111110' : '#55554F',
      }}
    >
      {tier}
    </span>
  );
}

function MethodPage() {
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#8B8B85', fontWeight: 500 }}>
        ระเบียบวิธี
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 500, margin: '12px 0 14px', lineHeight: 1.3 }}>
        จากเอกสารสาธารณะ สู่สัญญาณที่ตรวจสอบซ้ำได้
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 15,
          color: '#55554F',
          lineHeight: 1.7,
          textWrap: 'pretty',
        }}
      >
        แพลตฟอร์มนี้ไม่ตัดสินว่าผู้ใดทุจริต — ระบบใช้ข้อมูลสาธารณะ กฎที่อธิบายได้
        และการเปรียบเทียบกับกลุ่มหน่วยงานลักษณะเดียวกัน
        เพื่อชี้รายการที่สมควรได้รับการตรวจสอบเพิ่มเติมโดยมนุษย์
        ทุกขั้นตอนด้านล่างเปิดเผยต่อสาธารณะ
      </p>
      <p style={{ margin: '14px 0 0', fontSize: 13.5, color: '#55554F', lineHeight: 1.65 }}>
        ชุดกฎความเสี่ยงอ้างอิงแผนที่รูปแบบฮั้ว/ทุจริตจัดซื้อจัดจ้าง (ระดับสร้างโครงการ → TOR →
        วิธีจัดซื้อ → ฮั้วผู้เสนอราคา → พิจารณาผล → หลังสัญญา) — ใช้เพื่อตรวจจับและออกแบบระบบ
        ไม่ใช่ข้อกล่าวหาว่าทุกหน่วยงานใช้วิธีเหล่านี้ · สัญญาณเดี่ยวไม่ใช่หลักฐานทุจริต
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '48px 0 0' }}>ขั้นตอนการทำงาน</h2>
      <div style={{ marginTop: 16, borderTop: '1px solid #111110' }}>
        {WORKFLOW_STEPS.map((step) => (
          <div
            key={step.n}
            style={{
              display: 'flex',
              gap: 20,
              padding: '16px 0',
              borderBottom: '1px solid #EEEEEA',
            }}
          >
            <div style={{ width: 32, flex: 'none', fontSize: 13, color: '#8B8B85' }}>{step.n}</div>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{step.title}</div>
              <div style={{ fontSize: 13.5, color: '#55554F', marginTop: 4, lineHeight: 1.6 }}>
                {step.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '48px 0 0' }}>
        5 มิติความเสี่ยง + คุณภาพข้อมูล
      </h2>
      <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#55554F', lineHeight: 1.55 }}>
        จัดกลุ่มสัญญาณตามโครงสร้างการสมยอม — ไม่รวมเป็นคะแนนทุจริตเดียว · หลายสัญญาณร่วมกันจึงควรนำไปสอบสวน
      </p>
      <div style={{ marginTop: 16, borderTop: '1px solid #111110' }}>
        {[...RISK_SCORE_DIMS, RISK_DIM_DATA].map((dim) => {
          const rules = RISK_RULES.filter((r) => r.dim === dim.id);
          const deferred = dim.deferred;
          return (
            <div
              key={dim.id}
              style={{
                padding: '16px 0',
                borderBottom: '1px solid #EEEEEA',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{dim.th}</div>
                  <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 2 }}>{dim.en}</div>
                </div>
                <div style={{ fontSize: 11.5, color: '#8B8B85' }}>
                  {rules.length ? `${rules.length} กฎ` : 'ยังไม่มีกฎอัตโนมัติ'}
                </div>
              </div>
              <div style={{ fontSize: 13.5, color: '#55554F', marginTop: 6, lineHeight: 1.55 }}>
                {dim.text}
              </div>
              {deferred ? (
                <div style={{ fontSize: 12.5, color: '#8B8B85', marginTop: 6, lineHeight: 1.5 }}>
                  ช่องว่าง: {deferred}
                </div>
              ) : null}
              {rules.length > 0 ? (
                <div style={{ marginTop: 12, borderTop: '1px solid #F0F0EC' }}>
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '72px 1fr',
                        gap: 12,
                        padding: '9px 0',
                        borderBottom: '1px solid #F6F6F3',
                        alignItems: 'baseline',
                      }}
                    >
                      <div style={{ fontSize: 11.5, color: '#8B8B85', letterSpacing: '.02em' }}>
                        {rule.id}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, lineHeight: 1.45 }}>{rule.text}</div>
                        <div style={{ fontSize: 11, color: '#8B8B85', marginTop: 2 }}>
                          {rule.cat}
                          {rule.needs ? ` · ต้องการ: ${rule.needs}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 12.5, color: '#8B8B85', marginTop: 14, lineHeight: 1.6 }}>
        รวม {RISK_RULES.length} สัญญาณในทะเบียนระเบียบวิธี — ทุกสัญญาณแสดงค่าที่สังเกตได้ คำอธิบาย
        ระดับ ความเชื่อมั่น คำอธิบายโดยสุจริต และหลักฐาน · R18/R19/R23 แน่นขึ้นเมื่อดึงวันจดทะเบียน
        ที่อยู่ และทุนจาก DataForThai ในแท็บความเชื่อมโยง
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '48px 0 0' }}>เครื่องมือวิเคราะห์หลัก</h2>
      <p
        style={{
          margin: '14px 0 0',
          fontSize: 13.5,
          color: '#55554F',
          lineHeight: 1.7,
          textWrap: 'pretty',
        }}
      >
        ความสามารถการวิเคราะห์ที่แพลตฟอร์มใช้และกำลังพัฒนา — P0 คือแกนหลักที่ทุกสัญญาณต้องพึ่งพา
        P1 คือชั้นวิเคราะห์ขั้นสูงที่ต่อยอดจากข้อมูลเดียวกัน
      </p>
      <div style={{ marginTop: 16, borderTop: '1px solid #111110' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '200px minmax(0,1fr) 46px 96px',
            gap: 16,
            padding: '10px 0',
            borderBottom: '1px solid #E4E4E0',
            fontSize: 11,
            color: '#8B8B85',
          }}
        >
          <div>ความสามารถ</div>
          <div>สิ่งที่เผยให้เห็น · ตัวอย่าง</div>
          <div>ระดับ</div>
          <div style={{ textAlign: 'right' }}>สถานะ</div>
        </div>
        {CAPABILITIES.map((cap) => (
          <div
            key={cap.title}
            style={{
              display: 'grid',
              gridTemplateColumns: '200px minmax(0,1fr) 46px 96px',
              gap: 16,
              padding: '14px 0',
              borderBottom: '1px solid #EEEEEA',
              alignItems: 'baseline',
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{cap.title}</div>
              <div style={{ fontSize: 11, color: '#8B8B85', marginTop: 3 }}>{cap.sub}</div>
            </div>
            <div style={{ fontSize: 13, color: '#55554F', lineHeight: 1.6 }}>{cap.desc}</div>
            <div>
              <TierBadge tier={cap.tier} />
            </div>
            <div style={{ fontSize: 11.5, color: cap.statusColor, textAlign: 'right' }}>
              {cap.status}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '48px 0 0' }}>ข้อกำหนดด้านหลักฐาน</h2>
      <p style={{ margin: '14px 0 0', fontSize: 13.5, color: '#55554F', lineHeight: 1.7 }}>
        ข้อเท็จจริงทุกรายการที่ระบบสกัดจะเก็บ: เอกสารต้นทางและเลขหน้า · URL และเวลาดึงข้อมูล ·
        วิธีสกัดและเวอร์ชันโมเดล · ค่าความเชื่อมั่น · สถานะการตรวจโดยเจ้าหน้าที่
      </p>
      <div
        style={{
          marginTop: 18,
          border: '1px solid #111110',
          padding: '20px 24px',
          fontSize: 14.5,
          lineHeight: 1.7,
          background: '#fff',
        }}
      >
        เอกสารต้นฉบับ + ข้อเท็จจริงที่สกัดได้ + กฎหรือการคำนวณที่ระบุชัด
        <br />
        <span style={{ color: '#8B8B85' }}>= ทุกสัญญาณความเสี่ยงต้องทำซ้ำและตรวจสอบได้</span>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '48px 0 0' }}>สิ่งที่แพลตฟอร์มไม่ทำ</h2>
      <div style={{ marginTop: 16, borderTop: '1px solid #111110' }}>
        {LIMITATIONS.map((text) => (
          <div
            key={text}
            style={{
              display: 'flex',
              gap: 14,
              padding: '12px 0',
              borderBottom: '1px solid #EEEEEA',
              fontSize: 13.5,
              lineHeight: 1.6,
            }}
          >
            <span style={{ color: '#8B8B85' }}>✕</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function SourcesPage() {
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#8B8B85', fontWeight: 500 }}>
        แหล่งข้อมูล
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 500, margin: '12px 0 14px', lineHeight: 1.3 }}>
        ข้อมูลสาธารณะเท่านั้น — บันทึกที่มาทุกรายการ
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 15,
          color: '#55554F',
          lineHeight: 1.7,
          textWrap: 'pretty',
        }}
      >
        ระบบเก็บเฉพาะเอกสารที่หน่วยงานรัฐเผยแพร่ต่อสาธารณะตามกฎหมาย
        ทุกไฟล์ถูกบันทึกพร้อม URL ต้นทาง เวลาดึงข้อมูล และค่าแฮช
        เพื่อให้ตรวจสอบย้อนกลับได้เสมอ
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '48px 0 0' }}>ประเภทแหล่งข้อมูล</h2>
      <div style={{ marginTop: 16, borderTop: '1px solid #111110' }}>
        {SOURCE_TYPES.map((src) => (
          <div
            key={src.title}
            style={{
              display: 'grid',
              gridTemplateColumns: '220px 1fr',
              gap: 20,
              padding: '16px 0',
              borderBottom: '1px solid #EEEEEA',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>{src.title}</div>
            <div style={{ fontSize: 13.5, color: '#55554F', lineHeight: 1.6 }}>{src.desc}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '48px 0 0' }}>หลักปฏิบัติในการเก็บข้อมูล</h2>
      <div style={{ marginTop: 16, borderTop: '1px solid #111110' }}>
        {COLLECTION_PRACTICES.map((text) => (
          <div
            key={text}
            style={{
              display: 'flex',
              gap: 14,
              padding: '12px 0',
              borderBottom: '1px solid #EEEEEA',
              fontSize: 13.5,
              lineHeight: 1.6,
            }}
          >
            <span style={{ color: '#8B8B85' }}>·</span>
            <span>{text}</span>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '48px 0 0' }}>สิ่งที่เราไม่เก็บ</h2>
      <div style={{ marginTop: 16, borderTop: '1px solid #111110' }}>
        {NOT_COLLECTED.map((text) => (
          <div
            key={text}
            style={{
              display: 'flex',
              gap: 14,
              padding: '12px 0',
              borderBottom: '1px solid #EEEEEA',
              fontSize: 13.5,
              lineHeight: 1.6,
            }}
          >
            <span style={{ color: '#8B8B85' }}>✕</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function CorrectionsPage({
  corrType,
  corrRef,
  corrDetail,
  corrEmail,
  corrSent,
  setCorrType,
  setCorrRef,
  setCorrDetail,
  setCorrEmail,
  submitCorr,
  resetCorr,
}: {
  corrType: string;
  corrRef: string;
  corrDetail: string;
  corrEmail: string;
  corrSent: boolean;
  setCorrType: (v: string) => void;
  setCorrRef: (v: string) => void;
  setCorrDetail: (v: string) => void;
  setCorrEmail: (v: string) => void;
  submitCorr: () => void;
  resetCorr: () => void;
}) {
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#8B8B85', fontWeight: 500 }}>
        ขอแก้ไขข้อมูล
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 500, margin: '12px 0 14px', lineHeight: 1.3 }}>
        พบข้อมูลไม่ถูกต้อง — แจ้งเราได้ทันที
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 15,
          color: '#55554F',
          lineHeight: 1.7,
          textWrap: 'pretty',
        }}
      >
        ความน่าเชื่อถือของแพลตฟอร์มขึ้นอยู่กับความถูกต้องของข้อมูล
        หน่วยงาน บริษัท หรือบุคคลที่ถูกอ้างถึง สามารถยื่นคำขอแก้ไขได้
        ทุกคำขอถูกตรวจกับเอกสารต้นทางและบันทึกผลต่อสาธารณะ
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '44px 0 0' }}>กระบวนการ</h2>
      <div style={{ marginTop: 16, borderTop: '1px solid #111110' }}>
        {CORR_PROCESS.map((step) => (
          <div
            key={step.n}
            style={{
              display: 'flex',
              gap: 20,
              padding: '14px 0',
              borderBottom: '1px solid #EEEEEA',
            }}
          >
            <div style={{ width: 32, flex: 'none', fontSize: 13, color: '#8B8B85' }}>{step.n}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
              <span style={{ fontWeight: 600 }}>{step.bold}</span>
              {step.rest}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '44px 0 0' }}>แบบฟอร์มคำขอ</h2>
      {!corrSent ? (
        <div
          style={{
            border: '1px solid #E4E4E0',
            background: '#fff',
            padding: 28,
            marginTop: 16,
          }}
        >
          <div style={{ fontSize: 12, color: '#55554F', marginBottom: 6 }}>ประเภทคำขอ</div>
          <select
            value={corrType}
            onChange={(e) => setCorrType(e.target.value)}
            style={selectStyle}
          >
            <option value="ข้อมูลที่สกัดไม่ถูกต้อง">
              ข้อมูลที่สกัดไม่ถูกต้อง (จำนวนเงิน วันที่ ชื่อ)
            </option>
            <option value="การจับคู่นิติบุคคลผิด">
              การจับคู่นิติบุคคลผิด — บริษัทถูกเชื่อมโยงผิดราย
            </option>
            <option value="เอกสารไม่ครบหรือขาดบริบท">เอกสารไม่ครบหรือขาดบริบท</option>
            <option value="อื่น ๆ">อื่น ๆ</option>
          </select>
          <div style={{ fontSize: 12, color: '#55554F', margin: '18px 0 6px' }}>
            หน้าหรือเอกสารที่เกี่ยวข้อง
          </div>
          <input
            value={corrRef}
            onChange={(e) => setCorrRef(e.target.value)}
            placeholder="เช่น P-2568-014 หรือ D-268"
            style={inputStyle}
          />
          <div style={{ fontSize: 12, color: '#55554F', margin: '18px 0 6px' }}>รายละเอียด</div>
          <textarea
            value={corrDetail}
            onChange={(e) => setCorrDetail(e.target.value)}
            rows={4}
            placeholder="อธิบายว่าข้อมูลใดไม่ถูกต้อง และข้อมูลที่ถูกต้องคืออะไร พร้อมหลักฐานหากมี"
            style={textareaStyle}
          />
          <div style={{ fontSize: 12, color: '#55554F', margin: '18px 0 6px' }}>
            อีเมลสำหรับติดต่อกลับ
          </div>
          <input
            value={corrEmail}
            onChange={(e) => setCorrEmail(e.target.value)}
            placeholder="name@example.com"
            style={inputStyle}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
            <div
              onClick={submitCorr}
              className="trace24-btn-dark"
              style={{ padding: '12px 24px', fontSize: 13.5 }}
            >
              ส่งคำขอแก้ไข
            </div>
            <div style={{ fontSize: 11.5, color: '#8B8B85', lineHeight: 1.5 }}>
              ข้อมูลติดต่อใช้เพื่อแจ้งผลเท่านั้น ไม่เปิดเผยต่อสาธารณะ
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            border: '1px solid #111110',
            background: '#fff',
            padding: 28,
            marginTop: 16,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            รับคำขอแล้ว — หมายเลขอ้างอิง CR-2569-0142
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#55554F', lineHeight: 1.7 }}>
            เราจะยืนยันรับคำขอทางอีเมลภายใน 7 วัน และแจ้งผลการตรวจสอบพร้อมเหตุผล
            ผลทุกรายการถูกบันทึกในทะเบียนการแก้ไขสาธารณะ
          </p>
          <div
            onClick={resetCorr}
            className="trace24-hover-muted"
            style={{
              fontSize: 12.5,
              marginTop: 16,
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
              display: 'inline-block',
            }}
          >
            ยื่นคำขอเพิ่มเติม
          </div>
        </div>
      )}
    </>
  );
}

function AboutPage({ go }: { go: (page: Page) => void }) {
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#8B8B85', fontWeight: 500 }}>
        เกี่ยวกับเรา
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 500, margin: '12px 0 14px', lineHeight: 1.3 }}>
        องค์กรอิสระเพื่อความโปร่งใสของเงินสาธารณะ
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 15,
          color: '#55554F',
          lineHeight: 1.7,
          textWrap: 'pretty',
        }}
      >
        TRACE24 เป็นแพลตฟอร์มเทคโนโลยีเพื่อประโยชน์สาธารณะ ไม่สังกัดพรรคการเมือง
        ไม่แสวงหากำไร และไม่รับงานจากผู้มีส่วนได้เสียในการจัดซื้อจัดจ้างที่ระบบวิเคราะห์
      </p>

      <div
        style={{
          border: '1px solid #111110',
          background: '#fff',
          padding: '28px 32px',
          marginTop: 36,
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#8B8B85' }}>พันธกิจ</div>
        <div style={{ fontSize: 21, fontWeight: 500, lineHeight: 1.55, marginTop: 10 }}>
          ทำให้เงินสาธารณะทุกบาท ตามรอยได้ เปรียบเทียบได้ และซ่อนได้ยาก
        </div>
      </div>

      <div
        className="trace24-responsive-grid-3"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3,1fr)',
          gap: 0,
          borderTop: '1px solid #111110',
          borderBottom: '1px solid #E4E4E0',
          marginTop: 36,
        }}
      >
        <div
          style={{
            padding: '22px 24px 22px 0',
            borderRight: '1px solid #EEEEEA',
            marginRight: 24,
          }}
        >
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>อิสระและเป็นกลาง</div>
          <div style={{ fontSize: 13, color: '#55554F', marginTop: 8, lineHeight: 1.65 }}>
            ไม่ฝักใฝ่การเมือง ไม่รับเงินจากผู้รับจ้างหรือหน่วยงานที่ถูกวิเคราะห์
            เปิดเผยแหล่งเงินทุนทั้งหมด
          </div>
        </div>
        <div
          style={{
            padding: '22px 24px 22px 0',
            borderRight: '1px solid #EEEEEA',
            marginRight: 24,
          }}
        >
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>ยึดหลักฐานเป็นหลัก</div>
          <div style={{ fontSize: 13, color: '#55554F', marginTop: 8, lineHeight: 1.65 }}>
            ทุกข้อค้นพบอ้างอิงเอกสารต้นทางที่ตรวจสอบซ้ำได้ —
            ไม่มีข้อกล่าวหาที่ไม่มีเอกสารรองรับ
          </div>
        </div>
        <div style={{ padding: '22px 0' }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>มนุษย์เป็นผู้ตัดสิน</div>
          <div style={{ fontSize: 13, color: '#55554F', marginTop: 8, lineHeight: 1.65 }}>
            ระบบชี้รายการที่ควรตรวจสอบ —
            การประเมินและการดำเนินการเป็นหน้าที่ของผู้ตรวจสอบที่มีอำนาจ
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '48px 0 0' }}>นโยบายความโปร่งใส</h2>
      <div style={{ marginTop: 16, borderTop: '1px solid #111110' }}>
        <div
          onClick={() => go('method')}
          className="trace24-hover-row"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            padding: '13px 0',
            borderBottom: '1px solid #EEEEEA',
            fontSize: 13.5,
            cursor: 'pointer',
          }}
        >
          <span>ระเบียบวิธีฉบับเปิดเผย</span>
          <span style={{ color: '#8B8B85' }}>→</span>
        </div>
        <div
          onClick={() => go('corrections')}
          className="trace24-hover-row"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            padding: '13px 0',
            borderBottom: '1px solid #EEEEEA',
            fontSize: 13.5,
            cursor: 'pointer',
          }}
        >
          <span>กระบวนการขอแก้ไขข้อมูลและทะเบียนการแก้ไขสาธารณะ</span>
          <span style={{ color: '#8B8B85' }}>→</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            padding: '13px 0',
            borderBottom: '1px solid #EEEEEA',
            fontSize: 13.5,
            color: '#55554F',
          }}
        >
          <span>นโยบายผลประโยชน์ทับซ้อน</span>
          <span style={{ color: '#C9C9C4' }}>เร็ว ๆ นี้</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            padding: '13px 0',
            borderBottom: '1px solid #EEEEEA',
            fontSize: 13.5,
            color: '#55554F',
          }}
        >
          <span>ความโปร่งใสด้านแหล่งเงินทุน</span>
          <span style={{ color: '#C9C9C4' }}>เร็ว ๆ นี้</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            padding: '13px 0',
            borderBottom: '1px solid #EEEEEA',
            fontSize: 13.5,
            color: '#55554F',
          }}
        >
          <span>นโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งาน</span>
          <span style={{ color: '#C9C9C4' }}>เร็ว ๆ นี้</span>
        </div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '48px 0 0' }}>สิ่งที่เราไม่ใช่</h2>
      <p
        style={{
          margin: '14px 0 0',
          fontSize: 13.5,
          color: '#55554F',
          lineHeight: 1.75,
          textWrap: 'pretty',
        }}
      >
        แพลตฟอร์มนี้ไม่ใช่ศาล ไม่ใช่หน่วยงานสอบสวน และไม่ตัดสินว่าผู้ใดทุจริต —
        เราใช้ AI เอกสารสาธารณะ และการวิเคราะห์ความสัมพันธ์
        เพื่อชี้รูปแบบที่ผิดปกติ แสดงหลักฐานประกอบ
        และช่วยให้ผู้มีอำนาจตรวจสอบตัดสินใจได้ว่าสิ่งใดสมควรได้รับการสอบสวนต่อ
      </p>
    </>
  );
}

export function InfoScreen() {
  const {
    page,
    go,
    corrType,
    corrRef,
    corrDetail,
    corrEmail,
    corrSent,
    setCorrType,
    setCorrRef,
    setCorrDetail,
    setCorrEmail,
    submitCorr,
    resetCorr,
  } = useTrace24();

  return (
    <div
      data-screen-label="หน้าข้อมูลสาธารณะ"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ borderBottom: '1px solid #E4E4E0' }}>
        <div
          style={{
            maxWidth: 1160,
            margin: '0 auto',
            padding: '0 32px',
            height: 54,
            display: 'flex',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <Logo onClick={() => go('home', { selMuniId: null, query: '' })} />
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', height: '100%' }}>
            {INFO_TABS.map((tab) => {
              const active = page === tab.page;
              return (
                <div
                  key={tab.page}
                  onClick={() => go(tab.page)}
                  className="trace24-hover-text"
                  style={{
                    cursor: 'pointer',
                    fontSize: 13,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: `2px solid ${active ? '#111110' : 'transparent'}`,
                    color: active ? '#111110' : '#8B8B85',
                    marginBottom: -1,
                  }}
                >
                  {tab.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          maxWidth: 820,
          width: '100%',
          margin: '0 auto',
          padding: '56px 32px 96px',
          boxSizing: 'border-box',
          flex: 1,
        }}
      >
        {page === 'method' && <MethodPage />}
        {page === 'sources' && <SourcesPage />}
        {page === 'corrections' && (
          <CorrectionsPage
            corrType={corrType}
            corrRef={corrRef}
            corrDetail={corrDetail}
            corrEmail={corrEmail}
            corrSent={corrSent}
            setCorrType={setCorrType}
            setCorrRef={setCorrRef}
            setCorrDetail={setCorrDetail}
            setCorrEmail={setCorrEmail}
            submitCorr={submitCorr}
            resetCorr={resetCorr}
          />
        )}
        {page === 'about' && <AboutPage go={go} />}
      </div>

      <Footer />
    </div>
  );
}
