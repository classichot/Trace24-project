/**
 * Related-party checks: agency executives ↔ company directors/shareholders (R13)
 * and shared directors/addresses among winners (R5).
 *
 * Surname-only matches are Medium investigation leads — never auto-proof of kinship.
 */

import type { PipelineReportLike, RiskSignal } from './types';

export type CompanyPersonRole = 'director' | 'shareholder' | 'authorized' | 'other';

export type CompanyPerson = {
  name: string;
  role: CompanyPersonRole;
  sharePct?: number | null;
  note?: string;
  since?: string | null;
  until?: string | null;
  sourceUrl?: string;
};

export type AgencyExecutive = {
  name: string;
  title: string;
  since?: string | null;
  until?: string | null;
  sourceUrl?: string;
};

export type RelatedCompanyRecord = {
  tin?: string;
  name?: string;
  address?: string;
  directors: CompanyPerson[];
  sourceUrl?: string;
  fetchedAt?: string;
};

/** Persisted pack under data/related/{agencyId}.json */
export type RelatedPartyPack = {
  agencyId: string;
  updatedAt: string;
  note?: string;
  executives: AgencyExecutive[];
  companies: RelatedCompanyRecord[];
};

export type RelatedPartyMatch = {
  id: string;
  ruleId: 'R5' | 'R13';
  matchType: 'full_name' | 'surname' | 'shared_director' | 'shared_address';
  severity: 'High' | 'Medium' | 'Low';
  confirmed: false;
  executiveName?: string;
  executiveTitle?: string;
  personName: string;
  personRole?: string;
  companyId: string;
  companyName: string;
  otherCompanyId?: string;
  otherCompanyName?: string;
  explanation: string;
  innocentExplanation: string;
  evidenceRefs: string[];
};

const TITLE_RE =
  /^(นาย|นางสาว|นาง|ว่าที่\s*ร\.ต\.|ว่าที่\s*รต\.|ว่าที่ร้อยตรี|ดร\.|ผศ\.|รศ\.|ศ\.|Mr\.|Mrs\.|Ms\.)\s*/i;

export function normalizePersonName(name: string): string {
  return String(name || '')
    .replace(TITLE_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function personSurname(name: string): string {
  const n = normalizePersonName(name);
  const parts = n.split(' ').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : '';
}

export function emptyRelatedPack(agencyId: string): RelatedPartyPack {
  return {
    agencyId,
    updatedAt: new Date().toISOString(),
    note: 'ใส่ทำเนียบผู้บริหาร + กรรมการ/ผู้ถือหุ้นจาก DBD หรือ บอจ.5 — นามสกุลร่วมไม่ใช่ข้อพิสูจน์',
    executives: [],
    companies: [],
  };
}

type ContractorMutable = {
  name: string;
  reg?: string;
  address?: string;
  contracts?: number;
  total?: string;
  shareNum?: string;
  cats?: string;
  addrFlag?: boolean;
  addrNote?: string;
  directors?: { name: string; note: string; flag: boolean }[];
  related?: { id: string; name: string; note: string }[];
  risks?: { tag: string; text: string; sevKey: string }[];
  rows?: unknown[];
  [k: string]: unknown;
};

function roleLabel(role: CompanyPersonRole | string | undefined) {
  if (role === 'shareholder') return 'ผู้ถือหุ้น';
  if (role === 'authorized') return 'ผู้มีอำนาจลงนาม';
  if (role === 'director') return 'กรรมการ';
  return role || 'บุคคลในนิติบุคคล';
}

function collectCompanyPeople(
  report: PipelineReportLike,
  pack: RelatedPartyPack | null
): Map<string, { name: string; people: CompanyPerson[]; address: string; tin: string }> {
  const out = new Map<string, { name: string; people: CompanyPerson[]; address: string; tin: string }>();
  const contractors = (report.contractors || {}) as Record<string, ContractorMutable>;

  for (const [cid, co] of Object.entries(contractors)) {
    const people: CompanyPerson[] = (co.directors || []).map((d) => ({
      name: d.name,
      role: /ผู้ถือหุ้น/.test(d.note) ? 'shareholder' : 'director',
      note: d.note,
    }));
    out.set(cid, {
      name: co.name,
      people,
      address: String(co.address || ''),
      tin: String(co.reg || '').replace(/\D/g, ''),
    });
  }

  if (!pack) return out;

  for (const company of pack.companies) {
    const tin = String(company.tin || '').replace(/\D/g, '');
    const nameNorm = (company.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
    let cid =
      [...out.entries()].find(([, v]) => tin && v.tin && v.tin === tin)?.[0] ||
      [...out.entries()].find(([, v]) => nameNorm && v.name.replace(/\s+/g, ' ').trim().toLowerCase() === nameNorm)?.[0];

    if (!cid && (company.name || tin)) {
      cid = `ext-${tin || Object.keys(contractors).length + out.size}`;
      out.set(cid, {
        name: company.name || tin || cid,
        people: [],
        address: company.address || '',
        tin,
      });
    }
    if (!cid) continue;
    const row = out.get(cid)!;
    if (company.address) row.address = company.address;
    if (tin) row.tin = tin;
    row.people = [...row.people, ...(company.directors || [])];
  }

  return out;
}

/** Detect R5 (shared directors) and R13 (executive ↔ company person). */
export function detectRelatedPartyMatches(
  report: PipelineReportLike,
  pack: RelatedPartyPack | null = null
): RelatedPartyMatch[] {
  const matches: RelatedPartyMatch[] = [];
  const companies = collectCompanyPeople(report, pack);
  const executives = [
    ...((report as { executives?: AgencyExecutive[] }).executives || []),
    ...(pack?.executives || []),
  ];

  // R5 — shared director / shareholder name across two contractors
  const personIndex = new Map<string, { cid: string; name: string; person: CompanyPerson }[]>();
  for (const [cid, row] of companies) {
    if (!report.contractors?.[cid]) continue;
    for (const person of row.people) {
      const key = normalizePersonName(person.name);
      if (key.length < 4) continue;
      const list = personIndex.get(key) || [];
      list.push({ cid, name: row.name, person });
      personIndex.set(key, list);
    }
  }
  for (const [, list] of personIndex) {
    const uniqueCos = [...new Map(list.map((x) => [x.cid, x])).values()];
    if (uniqueCos.length < 2) continue;
    const a = uniqueCos[0];
    const b = uniqueCos[1];
    matches.push({
      id: `r5-${a.cid}-${b.cid}-${normalizePersonName(a.person.name)}`,
      ruleId: 'R5',
      matchType: 'shared_director',
      severity: 'High',
      confirmed: false,
      personName: a.person.name,
      personRole: roleLabel(a.person.role),
      companyId: a.cid,
      companyName: a.name,
      otherCompanyId: b.cid,
      otherCompanyName: b.name,
      explanation: `${a.person.name} (${roleLabel(a.person.role)}) พบในทั้ง「${a.name}」และ「${b.name}」ซึ่งเป็นผู้รับจ้างของหน่วยงานนี้`,
      innocentExplanation:
        'อาจเป็นกลุ่มธุรกิจเดียวกันที่เปิดเผย หรือชื่อซ้ำกันคนละคน — ต้องยืนยันด้วยเลขบัตร/เอกสาร DBD',
      evidenceRefs: [a.person.sourceUrl, b.person.sourceUrl].filter(Boolean) as string[],
    });
  }

  // R5 — shared registered address
  const byAddr = new Map<string, { cid: string; name: string }[]>();
  for (const [cid, row] of companies) {
    if (!report.contractors?.[cid]) continue;
    const addr = row.address.replace(/\s+/g, ' ').trim();
    if (addr.length < 12 || addr === '—') continue;
    const list = byAddr.get(addr) || [];
    list.push({ cid, name: row.name });
    byAddr.set(addr, list);
  }
  for (const [addr, list] of byAddr) {
    const unique = [...new Map(list.map((x) => [x.cid, x])).values()];
    if (unique.length < 2) continue;
    matches.push({
      id: `r5-addr-${unique[0].cid}-${unique[1].cid}`,
      ruleId: 'R5',
      matchType: 'shared_address',
      severity: 'High',
      confirmed: false,
      personName: addr,
      companyId: unique[0].cid,
      companyName: unique[0].name,
      otherCompanyId: unique[1].cid,
      otherCompanyName: unique[1].name,
      explanation: `ที่อยู่จดทะเบียนเดียวกันระหว่าง「${unique[0].name}」และ「${unique[1].name}」: ${addr}`,
      innocentExplanation: 'อาคารสำนักงานร่วมหรือที่อยู่จดทะเบียนกลุ่มบริษัทอาจเป็นเรื่องปกติทางธุรกิจ',
      evidenceRefs: [],
    });
  }

  // R13 — executive ↔ director/shareholder
  for (const exec of executives) {
    const execFull = normalizePersonName(exec.name);
    const execSur = personSurname(exec.name);
    if (!execFull) continue;

    for (const [cid, row] of companies) {
      if (!report.contractors?.[cid]) continue;
      for (const person of row.people) {
        const pFull = normalizePersonName(person.name);
        const pSur = personSurname(person.name);
        if (!pFull) continue;

        if (execFull === pFull) {
          matches.push({
            id: `r13-full-${cid}-${execFull}`,
            ruleId: 'R13',
            matchType: 'full_name',
            severity: 'High',
            confirmed: false,
            executiveName: exec.name,
            executiveTitle: exec.title,
            personName: person.name,
            personRole: roleLabel(person.role),
            companyId: cid,
            companyName: row.name,
            explanation: `ชื่อ「${exec.name}」(${exec.title}) ตรงกับ${roleLabel(person.role)}ของ「${row.name}」ซึ่งได้งานจากหน่วยงาน — รอยืนยันว่าเป็นบุคคลเดียวกัน`,
            innocentExplanation:
              'ชื่อ-นามสกุลซ้ำในประเทศไทยมีได้ — ต้องยืนยันด้วยเอกสารแต่งตั้งและทะเบียนนิติบุคคล',
            evidenceRefs: [exec.sourceUrl, person.sourceUrl].filter(Boolean) as string[],
          });
        } else if (execSur && pSur && execSur === pSur && execSur.length >= 3) {
          matches.push({
            id: `r13-sur-${cid}-${execSur}-${pFull}`,
            ruleId: 'R13',
            matchType: 'surname',
            severity: 'Medium',
            confirmed: false,
            executiveName: exec.name,
            executiveTitle: exec.title,
            personName: person.name,
            personRole: roleLabel(person.role),
            companyId: cid,
            companyName: row.name,
            explanation: `นามสกุล「${execSur}」ของ${exec.title} ${exec.name} ตรงกับ${roleLabel(person.role)} ${person.name} ของ「${row.name}」— นามสกุลร่วมไม่ใช่ข้อพิสูจน์เครือญาติ`,
            innocentExplanation: 'นามสกุลเดียวกันแพร่หลายได้ — ใช้เป็น lead ให้เจ้าหน้าที่ตรวจ ไม่ใช่ข้อกล่าวหา',
            evidenceRefs: [exec.sourceUrl, person.sourceUrl].filter(Boolean) as string[],
          });
        }
      }
    }
  }

  // Deduplicate by id
  return [...new Map(matches.map((m) => [m.id, m])).values()];
}

export function relatedMatchesToSignals(matches: RelatedPartyMatch[]): RiskSignal[] {
  return matches.map((m) => ({
    id: `sig-${m.id}`,
    ruleId: m.ruleId,
    category: `${m.ruleId} · ความสัมพันธ์`,
    title:
      m.ruleId === 'R13'
        ? 'ผู้บริหารหน่วยงานเชื่อมโยงกับกรรมการ/ผู้ถือหุ้นผู้ชนะ'
        : m.matchType === 'shared_address'
          ? 'ผู้รับจ้างมีที่อยู่จดทะเบียนร่วมกัน'
          : 'ผู้รับจ้างมีกรรมการ/ผู้ถือหุ้นร่วมกัน',
    severity: m.severity,
    score: m.severity === 'High' ? 0.82 : 0.55,
    confidence: m.matchType === 'full_name' ? 0.78 : m.matchType === 'surname' ? 0.45 : 0.8,
    subjectIds: [
      `company:${m.companyId}`,
      m.otherCompanyId ? `company:${m.otherCompanyId}` : '',
      m.executiveName ? 'person:executive' : '',
    ].filter(Boolean),
    explanation: m.explanation,
    innocentExplanation: m.innocentExplanation,
    evidenceRefs: m.evidenceRefs,
    facts: [
      m.executiveName ? `ผู้บริหาร: ${m.executiveName} (${m.executiveTitle || '—'})` : '',
      `บุคคลในนิติบุคคล: ${m.personName}`,
      `บริษัท: ${m.companyName}`,
      m.otherCompanyName ? `บริษัทอื่น: ${m.otherCompanyName}` : '',
      `ชนิดการจับคู่: ${m.matchType}`,
      'สถานะ: รอยืนยัน — ไม่ใช่ข้อกล่าวหา',
    ].filter(Boolean),
    kind: 'network',
    layer: 'signal',
  }));
}

/**
 * Merge related-party pack into report contractors / executives and annotate risks.
 * Returns a shallow-cloned report safe to return from APIs.
 */
export function applyRelatedPartyToReport(
  report: PipelineReportLike,
  pack: RelatedPartyPack | null
): PipelineReportLike & {
  executives: AgencyExecutive[];
  relatedParty: { matches: RelatedPartyMatch[]; coverage: string };
} {
  const cloned: PipelineReportLike & {
    executives?: AgencyExecutive[];
    relatedParty?: { matches: RelatedPartyMatch[]; coverage: string };
    alerts?: { tag: string; text: string; sevKey: string }[];
    contractors?: Record<string, ContractorMutable>;
  } = JSON.parse(JSON.stringify(report));

  const contractors = (cloned.contractors || {}) as Record<string, ContractorMutable>;
  cloned.contractors = contractors;

  // Merge pack companies onto contractors
  if (pack) {
    for (const company of pack.companies) {
      const tin = String(company.tin || '').replace(/\D/g, '');
      const nameNorm = (company.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const cid =
        Object.entries(contractors).find(([, co]) => {
          const reg = String(co.reg || '').replace(/\D/g, '');
          return (tin && reg && reg === tin) || false;
        })?.[0] ||
        Object.entries(contractors).find(([, co]) => {
          return nameNorm && co.name.replace(/\s+/g, ' ').trim().toLowerCase() === nameNorm;
        })?.[0];
      if (!cid) continue;
      const co = contractors[cid];
      if (company.address) {
        co.address = company.address;
        co.addrNote = company.sourceUrl
          ? `ที่มา: ${company.sourceUrl}`
          : co.addrNote || 'จากทะเบียนนิติบุคคลที่บันทึกไว้';
      }
      if (tin) co.reg = tin;
      const existing = new Set((co.directors || []).map((d) => normalizePersonName(d.name)));
      const added = (company.directors || [])
        .filter((d) => !existing.has(normalizePersonName(d.name)))
        .map((d) => ({
          name: d.name,
          note: [
            roleLabel(d.role),
            d.sharePct != null ? `ผู้ถือหุ้น ${d.sharePct}%` : '',
            d.note || '',
            d.since ? `ตั้งแต่ ${d.since}` : '',
            d.until ? `ถึง ${d.until}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
          flag: false,
        }));
      co.directors = [...(co.directors || []), ...added];
    }
  }

  const executives = [
    ...(cloned.executives || []),
    ...(pack?.executives || []),
  ];
  cloned.executives = executives;

  // Ensure contractor UI fields exist
  for (const co of Object.values(contractors)) {
    co.directors = co.directors || [];
    co.related = co.related || [];
    co.risks = co.risks || [];
    co.rows = co.rows || [];
    co.reg = co.reg || '—';
    co.address = co.address || '—';
    co.addrNote = co.addrNote || 'ยังไม่มีที่อยู่จาก DBD';
    co.addrFlag = co.addrFlag || false;
    co.shareNum = co.shareNum || '—';
    co.cats = co.cats || '—';
  }

  const matches = detectRelatedPartyMatches(cloned, null);
  for (const m of matches) {
    const tag = `${m.ruleId} · ความสัมพันธ์`;
    const sevKey = m.severity;
    const co = contractors[m.companyId];
    if (co) {
      if (!co.risks!.some((r) => r.text === m.explanation)) {
        co.risks!.push({ tag, text: m.explanation, sevKey });
      }
      for (const d of co.directors || []) {
        if (
          normalizePersonName(d.name) === normalizePersonName(m.personName) ||
          (m.matchType === 'surname' && personSurname(d.name) === personSurname(m.personName))
        ) {
          d.flag = true;
          if (!d.note.includes('รอยืนยัน')) d.note = `${d.note} · เชื่อมโยงผู้บริหาร (รอยืนยัน)`.trim();
        }
      }
      if (m.otherCompanyId && contractors[m.otherCompanyId]) {
        const other = contractors[m.otherCompanyId];
        if (!co.related!.some((r) => r.id === m.otherCompanyId)) {
          co.related!.push({
            id: m.otherCompanyId,
            name: other.name,
            note: m.explanation,
          });
        }
        if (!other.related!.some((r) => r.id === m.companyId)) {
          other.related!.push({
            id: m.companyId,
            name: co.name,
            note: m.explanation,
          });
        }
        if (!other.risks!.some((r) => r.text === m.explanation)) {
          other.risks!.push({ tag, text: m.explanation, sevKey });
        }
      }
    }

    cloned.alerts = cloned.alerts || [];
    if (!cloned.alerts.some((a) => a.text === m.explanation)) {
      cloned.alerts.push({ tag, text: m.explanation, sevKey });
    }
  }

  if (matches.length && cloned.caseFile) {
    const qs = cloned.caseFile.questions || [];
    for (const m of matches.slice(0, 5)) {
      const q: [string, string] =
        m.ruleId === 'R13'
          ? [
              `${m.executiveName} เกี่ยวข้องกับ ${m.personName} ของ ${m.companyName} หรือไม่?`,
              'รอตรวจ — นามสกุล/ชื่อตรงยังไม่ใช่ข้อพิสูจน์',
            ]
          : [
              `${m.companyName} กับ ${m.otherCompanyName} เป็นกลุ่มเดียวกันหรือเสนอราคาแข่งกันอย่างไร?`,
              'รอตรวจเอกสารกรรมการ/ที่อยู่',
            ];
      if (!qs.some((x) => x[0] === q[0])) qs.push(q);
    }
    cloned.caseFile.questions = qs;
  }

  const hasExec = executives.length > 0;
  const hasDir = Object.values(contractors).some((c) => (c.directors || []).length > 0);
  const coverage = !hasExec && !hasDir
    ? 'ยังไม่มีทำเนียบผู้บริหารและกรรมการ — เพิ่มที่แท็บความเชื่อมโยง'
    : !hasExec
      ? 'มีกรรมการบางราย แต่ยังไม่มีทำเนียบผู้บริหาร'
      : !hasDir
        ? 'มีทำเนียบผู้บริหาร แต่ยังไม่มีกรรมการ/ผู้ถือหุ้นจาก DBD'
        : matches.length
          ? `พบสัญญาณความเชื่อมโยง ${matches.length} รายการ (รอยืนยัน)`
          : 'มีข้อมูลทั้งสองฝั่ง — ยังไม่พบชื่อ/นามสกุลที่ตรงกัน';

  cloned.relatedParty = { matches, coverage };
  if (cloned.meta) {
    cloned.meta = {
      ...cloned.meta,
      relatedPartyNote: coverage,
    };
  }

  return cloned as PipelineReportLike & {
    executives: AgencyExecutive[];
    relatedParty: { matches: RelatedPartyMatch[]; coverage: string };
  };
}
