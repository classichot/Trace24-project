/**
 * Related-party checks: agency executives ↔ company directors/shareholders (R13)
 * and shared directors/addresses among winners (R5).
 *
 * Surname-only matches are Medium investigation leads — never auto-proof of kinship.
 */

import type { PipelineReportLike, RiskSignal } from './types';
import { buildUiClusters } from './ui-clusters';
import { buildUiEntityGraph } from './ui-entity-graph';

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

export type CompanyAgePrecision = 'day' | 'month' | 'year' | 'unknown';
export type CompanyAgeSource = 'web' | 'news' | 'dbd' | 'dataforthai' | 'manual';
export type CompanyAgeConfidence = 'high' | 'medium' | 'low';

export type RelatedCompanyRecord = {
  tin?: string;
  name?: string;
  address?: string;
  directors: CompanyPerson[];
  sourceUrl?: string;
  fetchedAt?: string;
  /** วัน/ปีจดทะเบียนหรือก่อตั้ง — จากเว็บ/ข่าว/DBD (รอยืนยัน) */
  registeredAt?: string | null;
  registeredAtPrecision?: CompanyAgePrecision;
  registeredAtSource?: CompanyAgeSource;
  registeredAtSourceUrl?: string;
  registeredAtQuote?: string;
  registeredAtConfidence?: CompanyAgeConfidence;
  registeredAtNote?: string;
  /** ทุนจดทะเบียน (บาท) จาก DataForThai / DBD */
  registeredCapital?: number | null;
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
  ruleId: 'R5' | 'R13' | 'R19';
  matchType: 'full_name' | 'surname' | 'shared_director' | 'shared_address' | 'shared_address_volume';
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

/** Normalize registered address for clustering (DataForThai / DBD). */
export function normalizeAddressKey(address: string): string {
  return String(address || '')
    .replace(/\s+/g, ' ')
    .replace(/ค้นหาบริษัท.*$/i, '')
    .replace(/ที่ตั้ง\s*แผนที่/gi, '')
    .replace(/^แผนที่\s*[:|]?/i, '')
    .replace(/^ที่ตั้ง\s*[:|]?/i, '')
    .replace(/[.,\u3002]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

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

/** Surname usable as a primary COI lead (short / single-token names skipped). */
export function isUsableSurname(surname: string): boolean {
  const s = String(surname || '').trim();
  return s.length >= 3 && !/^\d+$/.test(s);
}

function matchSortKey(m: RelatedPartyMatch): number {
  // Surname-first observation, then exact identity, then address / volume
  if (m.matchType === 'surname') return 0;
  if (m.matchType === 'full_name') return 1;
  if (m.matchType === 'shared_director') return 2;
  if (m.matchType === 'shared_address') return 3;
  if (m.matchType === 'shared_address_volume') return 4;
  return 5;
}

export function emptyRelatedPack(agencyId: string): RelatedPartyPack {
  return {
    agencyId,
    updatedAt: new Date().toISOString(),
    note: 'ใส่ทำเนียบผู้บริหาร/เจ้าหน้าที่ + กรรมการ/ผู้ถือหุ้นจากแหล่งสาธารณะ (DataForThai · Creden · e-GP · DBD/บอจ.5) — ตรวจกับแหล่งทางการอีกครั้ง · นามสกุลร่วมไม่ใช่ข้อพิสูจน์',
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
  totalN?: number;
  shareNum?: string;
  cats?: string;
  addrFlag?: boolean;
  addrNote?: string;
  directors?: { name: string; note: string; flag: boolean }[];
  related?: { id: string; name: string; note: string }[];
  risks?: { tag: string; text: string; sevKey: string }[];
  rows?: unknown[];
  registeredAt?: string | null;
  registeredAtSourceUrl?: string;
  registeredAtConfidence?: string;
  registeredAtNote?: string;
  registeredCapital?: number | null;
  [k: string]: unknown;
};

/** Gregorian calendar year from registeredAt string (supports พ.ศ.). */
export function parseRegisteredYear(registeredAt?: string | null): number | null {
  const m = String(registeredAt || '').match(/(25\d{2}|20\d{2}|19\d{2})/);
  if (!m) return null;
  let y = Number(m[1]);
  if (y >= 2400) y -= 543;
  if (y < 1900 || y > 2100) return null;
  return y;
}

function companyAgeYears(registeredAt?: string | null, asOf = new Date().getFullYear()): number | null {
  const y = parseRegisteredYear(registeredAt);
  if (y == null) return null;
  return Math.max(0, asOf - y);
}

function attachCompanyAgeRisks(contractors: Record<string, ContractorMutable>) {
  const asOf = new Date().getFullYear();
  for (const co of Object.values(contractors)) {
    const age = companyAgeYears(co.registeredAt, asOf);
    if (age == null || !co.registeredAt) continue;

    // Older company → soften first-seen proxy R18
    if (age > 5) {
      co.risks = (co.risks || []).filter(
        (r) => !(r.tag?.includes('R18') && /ปรากฏครั้งแรก/.test(r.text || ''))
      );
      continue;
    }

    const contracts = co.contracts || 0;
    const totalN =
      typeof co.totalN === 'number'
        ? co.totalN
        : Number(String(co.total || '').replace(/[^\d.]/g, '')) || 0;
    if (contracts < 3 && totalN < 2_000_000) continue;

    const sev = age <= 2 || contracts >= 5 || totalN >= 5_000_000 ? 'High' : 'Medium';
    const src = co.registeredAtSourceUrl ? ` · แหล่ง ${co.registeredAtSourceUrl}` : '';
    const conf = co.registeredAtConfidence ? ` · ความมั่นใจ ${co.registeredAtConfidence}` : '';
    const text = `จดทะเบียน/ก่อตั้งประมาณ ${co.registeredAt} (อายุ ~${age} ปี) แล้วชนะ ${contracts} สัญญาในหน่วยงานนี้${src}${conf} — รอยืนยันจาก DBD`;
    co.risks = co.risks || [];
    if (!co.risks.some((r) => r.tag?.includes('R18') && r.text.includes(String(co.registeredAt)))) {
      co.risks.push({
        tag: 'R18 · ผู้รับจ้างใหม่',
        text,
        sevKey: sev,
      });
    }
  }
}

/** R23 — มูลค่างานสูงเทียบทุนจดทะเบียนต่ำ (ศักยภาพไม่สมส่วน) */
function attachCapacityRisks(contractors: Record<string, ContractorMutable>) {
  for (const co of Object.values(contractors)) {
    const capital = typeof co.registeredCapital === 'number' ? co.registeredCapital : 0;
    if (!(capital > 0)) continue;
    const totalN =
      typeof co.totalN === 'number'
        ? co.totalN
        : Number(String(co.total || '').replace(/[^\d.]/g, '')) || 0;
    const contracts = co.contracts || 0;
    if (totalN < 1_000_000 && contracts < 3) continue;
    const ratio = totalN / capital;
    // มูลค่าสัญญาในหน่วยงานนี้สูงกว่าทุนจดทะเบียนมาก
    if (ratio < 8 && !(capital <= 1_000_000 && totalN >= 3_000_000)) continue;
    const sev = ratio >= 20 || (capital <= 100_000 && totalN >= 2_000_000) ? 'High' : 'Medium';
    const text = `ทุนจดทะเบียน ~${capital.toLocaleString('th-TH')} บาท แต่ชนะงานในหน่วยงานนี้ ~${totalN.toLocaleString('th-TH')} บาท (≈${ratio.toFixed(1)} เท่าของทุน) · ${contracts} สัญญา — รอยืนยันศักยภาพจริง`;
    co.risks = co.risks || [];
    if (!co.risks.some((r) => r.tag?.includes('R23'))) {
      co.risks.push({ tag: 'R23 · ศักยภาพ', text, sevKey: sev });
    }
  }
}

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

  // R5 — shared director / shareholder (exact name) across two contractors
  const personIndex = new Map<string, { cid: string; name: string; person: CompanyPerson }[]>();
  const surnameIndex = new Map<string, { cid: string; name: string; person: CompanyPerson }[]>();
  for (const [cid, row] of companies) {
    if (!report.contractors?.[cid]) continue;
    for (const person of row.people) {
      const key = normalizePersonName(person.name);
      if (key.length < 4) continue;
      const list = personIndex.get(key) || [];
      list.push({ cid, name: row.name, person });
      personIndex.set(key, list);

      const sur = personSurname(person.name);
      if (!isUsableSurname(sur)) continue;
      const surList = surnameIndex.get(sur) || [];
      surList.push({ cid, name: row.name, person });
      surnameIndex.set(sur, surList);
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

  // R5 — shared surname across contractors (primary observation lens)
  for (const [sur, list] of surnameIndex) {
    const byCompany = new Map<string, { cid: string; name: string; person: CompanyPerson }>();
    for (const row of list) {
      if (!byCompany.has(row.cid)) byCompany.set(row.cid, row);
    }
    const uniqueCos = [...byCompany.values()];
    if (uniqueCos.length < 2) continue;
    const a = uniqueCos[0];
    const b = uniqueCos[1];
    // Exact same person already covered by shared_director above
    if (normalizePersonName(a.person.name) === normalizePersonName(b.person.name)) continue;
    matches.push({
      id: `r5-sur-${sur}-${a.cid}-${b.cid}`,
      ruleId: 'R5',
      matchType: 'surname',
      severity: 'Medium',
      confirmed: false,
      personName: `${a.person.name} · ${b.person.name}`,
      personRole: `${roleLabel(a.person.role)} / ${roleLabel(b.person.role)}`,
      companyId: a.cid,
      companyName: a.name,
      otherCompanyId: b.cid,
      otherCompanyName: b.name,
      explanation: `นามสกุล「${sur}」พบใน「${a.name}」(${a.person.name}) และ「${b.name}」(${b.person.name}) — สังเกตจากนามสกุลเป็นหลัก · รอยืนยันว่าเกี่ยวข้องกันหรือไม่`,
      innocentExplanation:
        'นามสกุลเดียวกันแพร่หลายได้ หรือเป็นเครือญาติที่เปิดเผย — ใช้เป็น lead ไม่ใช่ข้อกล่าวหา',
      evidenceRefs: [a.person.sourceUrl, b.person.sourceUrl].filter(Boolean) as string[],
    });
  }

  // R5 — shared registered address · R19 — same address cluster wins > 5 contracts
  const contractorsMap = (report.contractors || {}) as Record<
    string,
    { contracts?: number; name?: string; address?: string }
  >;
  const byAddr = new Map<string, { cid: string; name: string; address: string; contracts: number }[]>();
  for (const [cid, row] of companies) {
    if (!report.contractors?.[cid]) continue;
    const addrDisplay = row.address.replace(/\s+/g, ' ').trim();
    const key = normalizeAddressKey(addrDisplay);
    if (key.length < 12 || addrDisplay === '—') continue;
    const contracts = Number(contractorsMap[cid]?.contracts || 0) || 0;
    const list = byAddr.get(key) || [];
    list.push({ cid, name: row.name, address: addrDisplay, contracts });
    byAddr.set(key, list);
  }
  for (const [, list] of byAddr) {
    const unique = [...new Map(list.map((x) => [x.cid, x])).values()];
    if (unique.length < 2) continue;
    const addr = unique[0].address;
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

    const totalWins = unique.reduce((s, x) => s + (x.contracts || 0), 0);
    if (totalWins > 5) {
      const names = unique.map((x) => x.name).slice(0, 4).join(' · ');
      const more = unique.length > 4 ? ` และอีก ${unique.length - 4} ราย` : '';
      matches.push({
        id: `r19-addr-${unique.map((x) => x.cid).sort().join('-')}`,
        ruleId: 'R19',
        matchType: 'shared_address_volume',
        severity: totalWins >= 10 ? 'High' : 'Medium',
        confirmed: false,
        personName: addr,
        companyId: unique[0].cid,
        companyName: unique[0].name,
        otherCompanyId: unique[1]?.cid,
        otherCompanyName: unique[1]?.name,
        explanation: `ผู้รับจ้าง ${unique.length} รายจดทะเบียนที่อยู่เดียวกันชนะรวม ${totalWins} สัญญาในหน่วยงานนี้ (เกิน 5): ${names}${more} · ที่อยู่: ${addr}`,
        innocentExplanation:
          'กลุ่มบริษัทเดียวกันหรืออาคารสำนักงานร่วมอาจใช้ที่อยู่เดียวกันได้ — ต้องดูกรรมการ/ผู้ถือหุ้นประกอบ',
        evidenceRefs: [],
      });
    }
  }

  // R13 — agency officer ↔ director/shareholder (surname-first, full name upgrades confidence)
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
            explanation: `ชื่อเต็ม「${exec.name}」(${exec.title}) ตรงกับ${roleLabel(person.role)}ของ「${row.name}」— ยกระดับจากนามสกุลเป็นบุคคลเดียวกัน (รอยืนยัน)`,
            innocentExplanation:
              'ชื่อ-นามสกุลซ้ำในประเทศไทยมีได้ — ต้องยืนยันด้วยเอกสารแต่งตั้งและทะเบียนนิติบุคคล',
            evidenceRefs: [exec.sourceUrl, person.sourceUrl].filter(Boolean) as string[],
          });
        } else if (isUsableSurname(execSur) && execSur === pSur) {
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
            explanation: `นามสกุล「${execSur}」ตรงกัน: ${exec.title} ${exec.name} ↔ ${roleLabel(person.role)} ${person.name} ของ「${row.name}」— สังเกตจากนามสกุลเป็นหลัก · ไม่ใช่ข้อพิสูจน์เครือญาติ`,
            innocentExplanation: 'นามสกุลเดียวกันแพร่หลายได้ — ใช้เป็น lead ให้เจ้าหน้าที่ตรวจ ไม่ใช่ข้อกล่าวหา',
            evidenceRefs: [exec.sourceUrl, person.sourceUrl].filter(Boolean) as string[],
          });
        }
      }
    }
  }

  // Deduplicate, then surname-first ordering
  const deduped = [...new Map(matches.map((m) => [m.id, m])).values()];
  deduped.sort((a, b) => matchSortKey(a) - matchSortKey(b) || a.ruleId.localeCompare(b.ruleId));
  return deduped;
}

export function relatedMatchesToSignals(matches: RelatedPartyMatch[]): RiskSignal[] {
  return matches.map((m) => ({
    id: `sig-${m.id}`,
    ruleId: m.ruleId,
    category: m.ruleId === 'R19' ? 'R19 · ที่อยู่ร่วม' : `${m.ruleId} · ความสัมพันธ์`,
    title:
      m.ruleId === 'R13'
        ? m.matchType === 'surname'
          ? 'นามสกุลเจ้าหน้าที่หน่วยงานตรงกับกรรมการ/ผู้ถือหุ้นผู้ชนะ'
          : 'ชื่อเจ้าหน้าที่หน่วยงานตรงกับกรรมการ/ผู้ถือหุ้นผู้ชนะ'
        : m.ruleId === 'R19'
          ? 'บริษัทที่อยู่เดียวกันชนะรวมเกิน 5 สัญญา'
          : m.matchType === 'shared_address'
            ? 'ผู้รับจ้างมีที่อยู่จดทะเบียนร่วมกัน'
            : m.matchType === 'surname'
              ? 'นามสกุลกรรมการ/ผู้ถือหุ้นร่วมระหว่างผู้รับจ้าง'
              : 'ผู้รับจ้างมีกรรมการ/ผู้ถือหุ้นร่วมกัน',
    severity: m.severity,
    score: m.severity === 'High' ? 0.82 : m.matchType === 'surname' ? 0.58 : 0.55,
    confidence:
      m.matchType === 'full_name'
        ? 0.78
        : m.matchType === 'surname'
          ? 0.52
          : m.ruleId === 'R19'
            ? 0.75
            : 0.8,
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
      if (company.registeredAt) {
        co.registeredAt = company.registeredAt;
        co.registeredAtSourceUrl = company.registeredAtSourceUrl || company.sourceUrl;
        co.registeredAtConfidence = company.registeredAtConfidence;
        co.registeredAtNote = company.registeredAtNote;
      }
      if (typeof company.registeredCapital === 'number' && company.registeredCapital > 0) {
        co.registeredCapital = company.registeredCapital;
      }
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
    attachCompanyAgeRisks(contractors);
    attachCapacityRisks(contractors);
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
    const tag =
      m.ruleId === 'R19'
        ? 'R19 · ที่อยู่ร่วม'
        : `${m.ruleId} · ความสัมพันธ์`;
    const sevKey = m.severity;
    const co = contractors[m.companyId];
    if (co) {
      if (m.matchType === 'shared_address' || m.matchType === 'shared_address_volume') {
        co.addrFlag = true;
        if (m.ruleId === 'R19') {
          co.addrNote = `ที่อยู่ร่วมหลายบริษัทชนะรวมเกิน 5 สัญญา · ${m.personName}`;
        }
      }
      if (!co.risks!.some((r) => r.text === m.explanation)) {
        co.risks!.push({ tag, text: m.explanation, sevKey });
      }
      for (const d of co.directors || []) {
        const sur = personSurname(d.name);
        const matchSur =
          m.matchType === 'surname' &&
          isUsableSurname(sur) &&
          (personSurname(m.personName) === sur ||
            personSurname(m.executiveName || '') === sur ||
            String(m.personName || '').includes(sur));
        if (normalizePersonName(d.name) === normalizePersonName(m.personName) || matchSur) {
          d.flag = true;
          if (!d.note.includes('รอยืนยัน')) {
            d.note = `${d.note} · ${
              m.matchType === 'surname' ? 'นามสกุลร่วม (รอยืนยัน)' : 'เชื่อมโยงผู้บริหาร (รอยืนยัน)'
            }`.trim();
          }
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

  // R19 — attach risk to every winner at the shared address (not just the first pair)
  for (const m of matches) {
    if (m.ruleId !== 'R19') continue;
    const key = normalizeAddressKey(m.personName);
    const tag = 'R19 · ที่อยู่ร่วม';
    const cluster = Object.entries(contractors).filter(
      ([, co]) => normalizeAddressKey(String(co.address || '')) === key
    );
    for (const [cid, co] of cluster) {
      co.addrFlag = true;
      co.addrNote = `ที่อยู่ร่วมหลายบริษัทชนะรวมเกิน 5 สัญญา · ${m.personName}`;
      if (!co.risks!.some((r) => r.text === m.explanation)) {
        co.risks!.push({ tag, text: m.explanation, sevKey: m.severity });
      }
      for (const [oid, other] of cluster) {
        if (oid === cid) continue;
        if (!co.related!.some((r) => r.id === oid)) {
          co.related!.push({ id: oid, name: other.name, note: m.explanation });
        }
      }
    }
  }

  if (matches.length && cloned.caseFile) {
    const qs = cloned.caseFile.questions || [];
    for (const m of matches.slice(0, 5)) {
      const q: [string, string] =
        m.ruleId === 'R13'
          ? [
              m.matchType === 'surname'
                ? `นามสกุลของ ${m.executiveName} เกี่ยวข้องกับ ${m.personName} ของ ${m.companyName} หรือไม่?`
                : `${m.executiveName} เป็นคนเดียวกับ ${m.personName} ของ ${m.companyName} หรือไม่?`,
              'รอตรวจ — นามสกุล/ชื่อตรงยังไม่ใช่ข้อพิสูจน์',
            ]
          : [
              m.matchType === 'surname'
                ? `นามสกุลร่วมระหว่าง ${m.companyName} กับ ${m.otherCompanyName} เชื่อมโยงกันอย่างไร?`
                : `${m.companyName} กับ ${m.otherCompanyName} เป็นกลุ่มเดียวกันหรือเสนอราคาแข่งกันอย่างไร?`,
              'รอตรวจเอกสารกรรมการ/ที่อยู่',
            ];
      if (!qs.some((x) => x[0] === q[0])) qs.push(q);
    }
    cloned.caseFile.questions = qs;
  }

  const hasExec = executives.length > 0;
  const hasDir = Object.values(contractors).some((c) => (c.directors || []).length > 0);
  const coverage = !hasExec && !hasDir
    ? 'ยังไม่มีทำเนียบผู้บริหาร/เจ้าหน้าที่และกรรมการ — เพิ่มที่แท็บความเชื่อมโยง'
    : !hasExec
      ? 'มีกรรมการบางราย แต่ยังไม่มีทำเนียบผู้บริหาร/เจ้าหน้าที่'
      : !hasDir
        ? 'มีทำเนียบผู้บริหาร/เจ้าหน้าที่ แต่ยังไม่มีกรรมการ/ผู้ถือหุ้นจากแหล่งสาธารณะ'
        : matches.length
          ? (() => {
              const surN = matches.filter((m) => m.matchType === 'surname').length;
              return surN
                ? `พบสัญญาณความเชื่อมโยง ${matches.length} รายการ · นามสกุลร่วม ${surN} (สังเกตจากนามสกุลเป็นหลัก · รอยืนยัน)`
                : `พบสัญญาณความเชื่อมโยง ${matches.length} รายการ (รอยืนยัน)`;
            })()
          : 'มีข้อมูลทั้งสองฝั่ง — ยังไม่พบนามสกุล/ชื่อที่ตรงกัน';

  cloned.relatedParty = { matches, coverage };
  if (cloned.meta) {
    cloned.meta = {
      ...cloned.meta,
      relatedPartyNote: coverage,
    };
  }

  // Refresh UI graph so related-party people appear on กราฟความสัมพันธ์
  try {
    const agency = cloned.agency as {
      th?: string;
      loc?: string;
      code?: string;
      tshort?: string;
    };
    const uiGraph = buildUiEntityGraph({
      agency: {
        th: agency?.th || '',
        loc: agency?.loc,
        code: agency?.code,
        tshort: agency?.tshort,
      },
      projects: (cloned.projects || {}) as Record<string, never>,
      contractors: (cloned.contractors || {}) as Record<string, never>,
      relatedMatches: matches,
    });
    (cloned as { graph?: unknown; details?: unknown }).graph = {
      nodes: uiGraph.nodes,
      edges: uiGraph.edges,
      details: uiGraph.details,
    };
    (cloned as { details?: unknown }).details = uiGraph.details;
    (cloned as { clusters?: unknown }).clusters = buildUiClusters({
      contractors: (cloned.contractors || {}) as Record<string, never>,
      relatedMatches: matches,
    });
    if (cloned.meta) {
      cloned.meta = {
        ...cloned.meta,
        graphTitle: uiGraph.meta.graphTitle,
        graphNote: uiGraph.meta.graphNote,
      };
    }
  } catch {
    /* keep prior graph */
  }

  return cloned as PipelineReportLike & {
    executives: AgencyExecutive[];
    relatedParty: { matches: RelatedPartyMatch[]; coverage: string };
  };
}
