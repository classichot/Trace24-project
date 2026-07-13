import type { AgencyRecord } from '@/lib/agencies';
import { fetchGovSpendingContracts, govSpendingPortalSearchUrl } from '@/lib/gov-apis/govspending';
import {
  egpAnnounceUrl,
  enrichReportFromEgAnnouncements,
  looksLikeBadWinner,
} from './announce-enrich';
import { buildCatalogStubReport } from './catalog-stub';
import { buildUiEntityGraph } from './ui-entity-graph';

type ContractLike = {
  project_id: string;
  project_name: string;
  project_money: string;
  project_type_name: string;
  dept_name: string;
  province: string;
  district?: string;
  _fy: string;
  contract: { winner: string; winner_tin: string; price_agree: string; contract_date: string }[];
};

function formatBaht(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' บาท';
}

function parseMoney(s: string) {
  const n = Number(String(s || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Turn govspending contracts into a TRACE24-shaped report usable by the UI. */
export function enrichStubWithContracts(
  stub: ReturnType<typeof buildCatalogStubReport>,
  contracts: ContractLike[],
  packageId: string
) {
  const projects: Record<string, unknown> = {};
  const contractors: Record<
    string,
    {
      name: string;
      reg: string;
      address: string;
      addrNote: string;
      addrFlag: boolean;
      contracts: number;
      total: string;
      totalN: number;
      shareNum: string;
      cats: string;
      directors: { name: string; note: string; flag: boolean }[];
      related: { id: string; name: string; note: string }[];
      risks: { tag: string; text: string; sevKey: string }[];
      rows: (string | null)[][];
    }
  > = {};
  let i = 0;

  for (const c of contracts) {
    if (!c.project_name) continue;
    // Prefer exact agency name match when available
    const dept = c.dept_name || '';
    const keyword = stub.agency.th;
    if (dept && dept !== keyword && !dept.includes(keyword) && !keyword.includes(dept)) {
      // keep loose matches from CKAN q= but skip obvious other schools if exact siblings
      if (keyword.length >= 8 && !dept.includes(keyword.slice(0, Math.min(12, keyword.length)))) {
        continue;
      }
    }

    i += 1;
    const pid = `p${i}`;
    let winnerName = c.contract[0]?.winner?.trim() || '';
    if (looksLikeBadWinner(winnerName)) winnerName = '';
    const winnerTinRaw = String(c.contract[0]?.winner_tin || '').trim();
    const winnerTin = looksLikeBadWinner(winnerTinRaw) ? '' : winnerTinRaw.replace(/\D/g, '');
    const awardN = parseMoney(c.contract[0]?.price_agree || c.project_money);
    let winnerId: string | null = null;
    if (winnerName) {
      winnerId =
        Object.entries(contractors).find(([, co]) => co.name === winnerName)?.[0] ||
        `c${Object.keys(contractors).length + 1}`;
      if (!contractors[winnerId]) {
        contractors[winnerId] = {
          name: winnerName,
          reg: winnerTin || '—',
          address: '—',
          addrNote: 'รอข้อมูลจาก DBD / บอจ.5',
          addrFlag: false,
          contracts: 0,
          total: '—',
          totalN: 0,
          shareNum: '—',
          cats: '—',
          directors: [],
          related: [],
          risks: [],
          rows: [],
        };
      }
      if (winnerTin && (!contractors[winnerId].reg || contractors[winnerId].reg === '—')) {
        contractors[winnerId].reg = winnerTin;
      }
      contractors[winnerId].contracts += 1;
      contractors[winnerId].totalN += awardN;
      contractors[winnerId].total = formatBaht(contractors[winnerId].totalN);
      contractors[winnerId].rows.push([
        pid,
        c.project_id || pid,
        c.project_name,
        formatBaht(awardN),
        c.project_type_name || '—',
        c._fy || '—',
      ]);
    }

    const projectCode = String(c.project_id || '');
    const egpUrl = /^\d{8,}$/.test(projectCode) ? egpAnnounceUrl(projectCode) : null;

    projects[pid] = {
      code: c.project_id || pid,
      name: c.project_name,
      cat: c.project_type_name || 'จัดซื้อจัดจ้าง',
      fy: c._fy ? `ปีงบ ${c._fy}` : '—',
      method: c.project_type_name || '—',
      methodShort: c.project_type_name || '—',
      award: formatBaht(awardN),
      budget: formatBaht(parseMoney(c.project_money)),
      ref: formatBaht(parseMoney(c.project_money)),
      pct: '—',
      winner: winnerId,
      announced: c.contract[0]?.contract_date || c._fy || '—',
      sevKey: 'Low',
      ind: 0,
      alerts: [] as {
        tag: string;
        title: string;
        sevKey: string;
        conf: string;
        facts: string[][];
        explain: string;
        innocent: string;
        evidence: string[];
      }[],
      timeline: [
        [
          c.contract[0]?.contract_date || c._fy || '—',
          'สัญญา / รายการจากภาษีไปไหน',
          govSpendingPortalSearchUrl(stub.agency.th),
        ],
        ...(egpUrl
          ? ([[c.contract[0]?.contract_date || c._fy || '—', 'ลิงก์ประกาศผู้ชนะ e-GP (จะดึงตอนสแกน)', egpUrl]] as [
              string,
              string,
              string,
            ][])
          : []),
      ],
      related: [] as [string, string, string][],
      _sourceUrl: egpUrl || govSpendingPortalSearchUrl(stub.agency.th),
    };
  }

  const totalContracts = Object.values(contractors).reduce((s, co) => s + co.contracts, 0) || 1;
  for (const co of Object.values(contractors)) {
    co.shareNum = `${Math.round((co.contracts / totalContracts) * 1000) / 10}%`;
    (co as { share?: string }).share = co.shareNum;
  }

  // Province from contracts — egpdepartment catalog often has empty จังหวัด,
  // and the same agency name can exist in more than one province (e.g. เทศบาลตำบลป่าไผ่).
  const provCount = new Map<string, number>();
  const distCount = new Map<string, number>();
  for (const c of contracts) {
    const p = c.province?.trim();
    if (p) provCount.set(p, (provCount.get(p) || 0) + 1);
    const d = c.district?.trim();
    if (d) distCount.set(d, (distCount.get(d) || 0) + 1);
  }
  const provRanked = [...provCount.entries()].sort((a, b) => b[1] - a[1]);
  const distRanked = [...distCount.entries()].sort((a, b) => b[1] - a[1]);
  const primaryProv = stub.agency.prov || provRanked[0]?.[0] || '';
  const primaryDist = stub.agency.dist || distRanked[0]?.[0] || '';
  const multiProv = provRanked.length > 1;
  const locFromContracts = multiProv
    ? `พบหลายจังหวัดในสัญญา: ${provRanked.map(([p, n]) => `${p} (${n})`).join(' · ')} — ชื่อหน่วยงานซ้ำได้`
    : primaryProv && primaryDist
      ? `อ.${primaryDist} · จ.${primaryProv}`
      : primaryProv
        ? `จ.${primaryProv}`
        : stub.agency.loc;

  stub.agency = {
    ...stub.agency,
    ...(primaryProv ? { prov: primaryProv } : {}),
    ...(primaryDist ? { dist: primaryDist } : {}),
    loc: locFromContracts || stub.agency.loc,
  };

  const topContractors = Object.entries(contractors)
    .map(([id, co]) => ({ id, name: co.name, value: co.total, n: co.contracts }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);
  const maxN = Math.max(1, ...topContractors.map((t) => t.n));
  const topWithPct = topContractors.map((t) => ({
    ...t,
    pct: `${Math.round((t.n / maxN) * 100)}%`,
  }));

  const firstPid = Object.keys(projects).slice(0, 1)[0] || '';
  const firstCid = Object.keys(contractors).slice(0, 1)[0] || '';

  const uiGraph = buildUiEntityGraph({
    agency: stub.agency,
    projects: projects as Record<string, { code?: string; name?: string; winner?: string | null; winnerId?: string | null; award?: string; method?: string; year?: string }>,
    contractors,
    relatedMatches: (stub as { relatedParty?: { matches?: unknown[] } }).relatedParty?.matches as
      | undefined,
  });

  return {
    ...stub,
    meta: {
      ...stub.meta,
      scanSummary: `ดึงจากภาษีไปไหน / data.go.th ${Object.keys(projects).length} โครงการ · รหัส ${stub.agency.code}`,
      dataPct: Object.keys(projects).length ? '65%' : '—',
      dataGapNote: Object.keys(projects).length
        ? multiProv
          ? `ชื่อ「${stub.agency.th}」พบสัญญาในหลายจังหวัด — แยกรหัสหน่วยงาน/พื้นที่ก่อนสรุปผล`
          : 'ข้อมูลสัญญาจาก CKAN egp-contact — ผู้ชนะอาจไม่ครบหากคอลัมน์เพี้ยน'
        : stub.meta.dataGapNote,
      catalogOnly: Object.keys(projects).length === 0,
      packageId,
      priorityNote: Object.keys(projects).length
        ? `แสดง ${Math.min(8, Object.keys(projects).length)} จาก ${Object.keys(projects).length} โครงการ`
        : 'ยังไม่มีโครงการในแคช',
      graphTitle: uiGraph.meta.graphTitle,
      graphNote: uiGraph.meta.graphNote,
    },
    stats: [
      { label: 'รหัสหน่วยงาน', value: String(stub.agency.code || '—'), sub: 'e-GP dept code' },
      {
        label: 'จังหวัด',
        value: stub.agency.prov || '—',
        sub: multiProv ? 'ชื่อซ้ำหลายจังหวัด' : stub.agency.loc || '—',
      },
      { label: 'โครงการ', value: String(Object.keys(projects).length), sub: packageId },
      { label: 'ผู้รับจ้าง', value: String(Object.keys(contractors).length), sub: 'จากสัญญา' },
      {
        label: 'ประเภท',
        value: stub.agency.tshort,
        sub: stub.agency.type,
      },
    ],
    projects,
    contractors,
    topContractors: topWithPct,
    alerts: [],
    priorityOrder: Object.keys(projects).slice(0, 8),
    def: {
      project: firstPid,
      contractor: firstCid,
      node: 'muni',
    },
    graph: {
      nodes: uiGraph.nodes,
      edges: uiGraph.edges,
      details: uiGraph.details,
    },
    details: uiGraph.details,
    caseFile: {
      id: `case-${stub.agency.id}`,
      title: stub.agency.th,
      summary: `รายงานเบื้องต้นจากทะเบียน e-GP + สัญญา data.go.th (${Object.keys(projects).length} โครงการ)`,
      status: Object.keys(projects).length ? 'มีข้อมูลสัญญา' : 'ทะเบียนเท่านั้น',
      signals: 'คะแนนความเสี่ยงจะคำนวณเมื่อเปิดผู้ช่วยสอบสวน — ไม่ใช่ข้อกล่าวหา',
      evidence: [govSpendingPortalSearchUrl(stub.agency.th)],
      questions: [],
      timeline: [],
    },
    stages: [
      ['ระบุหน่วยงานสำเร็จ', `รหัส ${stub.agency.code}`],
      ['พบในทะเบียน e-GP', stub.agency.tshort],
      ['ดึงสัญญา data.go.th', `${Object.keys(projects).length} โครงการ`],
      ['รายงานพร้อมแล้ว', packageId],
    ],
    sources: [
      ...stub.sources,
      {
        url: `https://data.go.th/dataset/${packageId}`,
        type: `data.go.th · ${packageId}`,
        status: Object.keys(projects).length ? 'ปกติ' : 'ไม่พบสัญญาที่ตรงชื่อ',
        ok: Object.keys(projects).length > 0,
        last: 'เพิ่งดึงข้อมูล',
        docs: String(Object.keys(projects).length),
      },
    ],
  };
}

export async function buildAgencyReportFromCatalog(
  agency: AgencyRecord,
  opts: { fetchContracts?: boolean; limit?: number } = {}
) {
  const stub = buildCatalogStubReport(agency);
  if (opts.fetchContracts === false) return stub;

  try {
    const { contracts, packageId, totalEstimate, fetchNotes } = await fetchGovSpendingContracts(
      agency.th,
      {
        limit: opts.limit ?? 80,
        deptCode: agency.code && agency.code !== '—' ? String(agency.code) : undefined,
        agencyId: agency.id,
      }
    );
    // Prefer exact dept_name matches; when จังหวัด is known, keep only that province
    // (same name can exist in multiple provinces — e.g. เทศบาลตำบลป่าไผ่).
    const exact = contracts.filter((c) => c.dept_name === agency.th);
    let use = exact.length ? exact : contracts;
    if (agency.prov) {
      const byProv = use.filter((c) => !c.province || c.province === agency.prov);
      if (byProv.length) use = byProv;
    }
    if (!use.length) {
      const notes = fetchNotes?.length ? fetchNotes.slice(0, 3).join(' · ') : '';
      const cacheMiss = /403|blocked|contracts-cache/i.test(notes) || !notes.includes('contracts-cache');
      return {
        ...stub,
        meta: {
          ...stub.meta,
          scanSummary: cacheMiss
            ? `อยู่ในทะเบียน e-GP · ยังไม่มีสัญญาในแคชสำหรับหน่วยงานนี้ (estimate ${totalEstimate})`
            : `อยู่ในทะเบียน e-GP · ค้นสัญญาแล้วยังไม่เจอที่ตรงชื่อ (estimate ${totalEstimate})`,
          dataGapNote: cacheMiss
            ? `Production อ่านจาก contracts-cache — เพิ่มชื่อนี้ใน data/contracts-cache/agencies-to-sync.json แล้วรัน npm run sync-contracts-cache จากเครือข่ายที่เข้า data.go.th ได้${notes ? ` · ${notes}` : ''}`
            : notes || stub.meta.dataGapNote,
        },
      };
    }
    const enriched = enrichStubWithContracts(stub, use, packageId);

    // Auto-fetch e-GP winner announcements for projects missing usable winners
    const projectList = Object.values(enriched.projects || {}) as { winner?: string | null }[];
    const missingWinners = projectList.filter((p) => !p.winner).length;
    if (missingWinners > 0) {
      const announce = await enrichReportFromEgAnnouncements(
        enriched as unknown as Parameters<typeof enrichReportFromEgAnnouncements>[0],
        {
          maxProjects: Math.min(20, missingWinners),
          concurrency: 3,
        }
      );
      if (announce.filled) {
        enriched.meta.scanSummary = `${enriched.meta.scanSummary} · เติมผู้ชนะจากประกาศ e-GP ${announce.filled} รายการ`;
      } else if (announce.tried) {
        enriched.meta.dataGapNote = `${enriched.meta.dataGapNote || ''} · ลองดึงประกาศ e-GP ${announce.tried} โครงการแล้วยังไม่พบไฟล์ประกาศผล (อาจใช้เทมเพลตอื่น)`.trim();
      }
    }

    return enriched;
  } catch (e) {
    return {
      ...stub,
      meta: {
        ...stub.meta,
        scanSummary: `อยู่ในทะเบียน e-GP · ดึงสัญญาไม่สำเร็จ: ${e instanceof Error ? e.message : 'error'}`,
        dataGapNote: 'ใช้รายงานทะเบียนชั่วคราว — ลองใหม่หรือตั้ง OPEND_API_KEY บน Vercel',
      },
    };
  }
}

export function agencyFromSearchParams(
  id: string,
  params: URLSearchParams
): AgencyRecord | null {
  const th = params.get('th')?.trim();
  if (!th) return null;
  return {
    id,
    th,
    en: params.get('en') || '',
    prov: params.get('prov') || '',
    dist: params.get('dist') || '',
    type: params.get('type') || 'หน่วยงานจัดซื้อ',
    tshort: params.get('tshort') || 'หน่วยจัดซื้อ',
    loc: params.get('loc') || '—',
    code: params.get('code') || '—',
    web: params.get('web') || '',
    aff: params.get('aff') || undefined,
    real: true,
  };
}
