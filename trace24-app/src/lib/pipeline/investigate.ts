import { buildTemporalGraph } from './graph';
import { hybridGraphRag } from './rag';
import { resolveEntities } from './resolve';
import { buildAlerts, scoreRisks } from './risk';
import { buildVectorIndex } from './vector';
import type {
  CaseBrief,
  EvidenceMapItem,
  InvestigationLead,
  InvestigationPack,
  PipelineLayerStatus,
  PipelineReportLike,
} from './types';

function layers(): { layer: string; status: PipelineLayerStatus; note: string }[] {
  return [
    { layer: 'Public Data Sources', status: 'live', note: 'Municipal + e-GP announce pages' },
    { layer: 'Source Registry + Ingestion Orchestrator', status: 'live', note: 'Registry + fetch-real-data CLI' },
    { layer: 'Crawler / API / File Ingestion', status: 'live', note: 'Open D timeout-guarded; announce HTML is official fallback' },
    { layer: 'Immutable Raw Evidence Storage', status: 'live', note: 'Checksum store under data/evidence' },
    { layer: 'OCR + Document Extraction', status: 'live', note: 'HTML/PDF text extract + OCR hook' },
    { layer: 'Validation + Normalisation', status: 'live', note: 'Thai digits, baht, titles, methods' },
    { layer: 'Structured Database', status: 'live', note: 'JSON structured reports in data/real' },
    { layer: 'Vector Index', status: 'live', note: 'Local TF-IDF passages in data/vector' },
    { layer: 'Entity Resolution', status: 'live', note: 'Alias clustering for companies/people/projects' },
    { layer: 'Temporal Knowledge Graph', status: 'live', note: 'Agency–project–supplier graph' },
    { layer: 'Detection Engines', status: 'live', note: 'Built-in rules + human-approved dynamic rules' },
    { layer: 'Risk Signal and Scoring Engine', status: 'live', note: 'Deterministic scores (LLM drafts only; approve to activate)' },
    { layer: 'Alert System', status: 'live', note: 'High-severity signal alerts' },
    { layer: 'Hybrid Graph RAG', status: 'live', note: 'Graph + vector + optional LLM synthesize' },
    { layer: 'Investigation Assistant', status: 'live', note: 'Brief / leads / Rule Proposer queue' },
  ];
}

function buildEvidenceMap(report: PipelineReportLike): EvidenceMapItem[] {
  const items: EvidenceMapItem[] = [];
  for (const [pid, pr] of Object.entries(report.projects || {})) {
    for (const [ti, row] of (pr.timeline || []).entries()) {
      items.push({
        id: `em-${pid}-${ti}`,
        label: row[1],
        kind: /ผู้ชนะ|คัดเลือก/.test(row[1]) ? 'winner_announce' : 'announce',
        when: row[0],
        url: row[2] && row[2] !== 'e-GP' ? row[2] : pr._sourceUrl || null,
        relatedEntityIds: [`project:${pid}`, pr.winner ? `company:${pr.winner}` : ''].filter(Boolean),
      });
    }
  }
  const priority = new Set(report.priorityOrder || []);
  return items
    .sort((a, b) => {
      const ap = a.relatedEntityIds.some((id) => priority.has(id.replace('project:', ''))) ? 1 : 0;
      const bp = b.relatedEntityIds.some((id) => priority.has(id.replace('project:', ''))) ? 1 : 0;
      return bp - ap;
    })
    .slice(0, 40);
}

function buildCaseBrief(report: PipelineReportLike, riskOverall: number): CaseBrief {
  const cf = report.caseFile;
  const top = (report.topContractors || []).slice(0, 3);
  const high = Object.values(report.projects || {}).filter((p) => p.sevKey === 'High').length;
  const withPrice = Object.values(report.projects || {}).filter((p) => p.award && p.award !== '—').length;
  const keyFindings = [
    `สัญญาณความเสี่ยงรวมในรายงาน · ระดับคะแนนรวม ${riskOverall.toFixed(2)}`,
    `โครงการระดับสูง ${high} รายการ · มีราคาจากประกาศ ${withPrice} รายการ`,
    ...top.map((t) => `ผู้รับจ้างเด่น: ${t.name} · ${t.n} สัญญา · ${t.value}`),
  ];
  return {
    title: cf?.title || `การวิเคราะห์จัดซื้อจัดจ้าง — ${report.agency?.th || ''}`,
    summary: cf?.summary || report.meta?.scanSummary || '',
    riskExplanation:
      cf?.signals ||
      `คะแนนความเสี่ยงคำนวณจากกฎที่อธิบายได้ + ความกระจุกตัวผู้รับจ้าง + ความคล้ายชื่อโครงการ (ไม่ใช่ข้อกล่าวหา)`,
    sourceCitations: [
      ...(report.sources || []).map((s) => s.url),
      ...(cf?.evidence || []).slice(0, 8),
    ].filter(Boolean),
    keyFindings,
  };
}

function buildLeads(report: PipelineReportLike): InvestigationLead[] {
  const leads: InvestigationLead[] = [];
  const priced = Object.values(report.projects || {}).filter((p) => p.award && p.award !== '—').length;
  const total = Object.keys(report.projects || {}).length;
  if (priced < total * 0.5) {
    leads.push({
      id: 'lead-missing-prices',
      question: 'ทำไมโครงการจำนวนมากยังไม่มีราคาที่ตกลงในชุดข้อมูล?',
      why: 'ประกาศบางรายการเป็น PDF / ไฟล์ e-GP หาย หรือยังไม่ใช่ประกาศผู้ชนะ',
      missingDocuments: ['ประกาศผู้ชนะฉบับเต็ม', 'สัญญา', 'ใบเสนอราคา'],
      nextActions: ['รัน document extraction บน PDF', 'เชื่อม DBD สำหรับผู้ชนะ', 'เทียบกับงบประมาณประจำปี'],
      priority: 'High',
    });
  }

  for (const q of report.caseFile?.questions || []) {
    leads.push({
      id: `lead-q-${leads.length}`,
      question: q[0],
      why: `สถานะในสำนวน: ${q[1]}`,
      missingDocuments: ['เอกสารชี้แจงจากหน่วยงาน', 'หลักฐานประกอบเพิ่มเติม'],
      nextActions: ['ส่งหนังสือขอข้อมูล', 'ถาม Hybrid Graph RAG ด้วยชื่อโครงการ'],
      priority: 'Medium',
    });
  }

  const highProjects = Object.entries(report.projects || {})
    .filter(([, p]) => p.sevKey === 'High')
    .slice(0, 5);
  for (const [pid, pr] of highProjects) {
    leads.push({
      id: `lead-proj-${pid}`,
      question: `ควรตรวจสอบโครงการ ${pr.code} เพิ่มหรือไม่?`,
      why: pr.alerts?.[0]?.title || 'มีสัญญาณระดับสูง',
      missingDocuments: ['TOR', 'ราคากลาง', 'รายชื่อผู้เสนอราคา'],
      nextActions: ['เปิดหน้าโครงการใน TRACE24', 'ไล่ timeline เอกสาร', 'ถาม RAG เกี่ยวกับผู้ชนะ'],
      priority: 'High',
    });
  }

  leads.push({
    id: 'lead-dbd',
    question: 'ผู้ชนะมีความเชื่อมโยงกรรมการ/ที่อยู่ร่วมกันหรือไม่?',
    why: 'Entity resolution ชื่อซ้ำทำงานแล้ว — ยังขาดข้อมูลกรรมการจาก DBD',
    missingDocuments: ['บอจ.5', 'ข้อมูลกรรมการ DBD', 'ที่อยู่จดทะเบียน'],
    nextActions: ['เชื่อมแหล่ง DBD', 'ตรวจคลัสเตอร์ชื่อในแท็บผู้ช่วยสอบสวน'],
    priority: 'Medium',
  });

  return leads.slice(0, 12);
}

export function hybridGraphRetrieve(report: PipelineReportLike, query: string) {
  const agencyId = report.agency?.id || 'agency';
  return hybridGraphRag(agencyId, report, query);
}

export function buildInvestigationPack(
  agencyId: string,
  report: PipelineReportLike
): InvestigationPack {
  const risk = scoreRisks(report);
  const vector = buildVectorIndex(agencyId, report);
  const entityClusters = resolveEntities(report);
  return {
    agencyId,
    generatedAt: new Date().toISOString(),
    pipeline: layers(),
    evidenceMap: buildEvidenceMap(report),
    caseBrief: buildCaseBrief(report, risk.overall),
    leads: buildLeads(report),
    risk,
    alerts: buildAlerts(risk),
    graph: buildTemporalGraph(report),
    entityClusters,
    vector: { passages: vector.nDocs, builtAt: vector.builtAt },
    extraction: {
      status: 'live',
      methods: ['html', 'pdf-text', 'pdf-stream', 'ocr-stub'],
      note: 'extract.ts — HTML/PDF live; image OCR hook ready',
    },
  };
}
