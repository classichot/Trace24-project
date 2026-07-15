import type { AgencyRecord } from '@/lib/agencies';
import { fetchGovSpendingContracts, govSpendingPortalSearchUrl } from '@/lib/gov-apis/govspending';
import {
  egpAnnounceUrl,
  enrichReportFromEgAnnouncements,
  looksLikeBadWinner,
} from './announce-enrich';
import { buildCatalogStubReport } from './catalog-stub';
import {
  parseProjectQuantity,
  unitRateFromAward,
  type UnitRateKind,
} from '@/lib/parse-project-quantity';
import { servicesSimilar } from '@/lib/title-similarity';
import { detectCatalogRules } from './detect-catalog-rules';
import { detectContractSplitClusters } from './detect-contract-split';
import {
  categorizeWork,
  formatBenchmarkBaht,
  pctLabel,
  resolveProjectBenchmark,
  severityFromVsMedian,
  type WorkCategoryId,
} from './price-benchmark';
import { buildUiClusters } from './ui-clusters';
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

    const workCat = categorizeWork(c.project_name);
    const budgetN = parseMoney(c.project_money);
    projects[pid] = {
      code: c.project_id || pid,
      name: c.project_name,
      cat: workCat.label,
      workCategoryId: workCat.id,
      fy: c._fy ? `ปีงบ ${c._fy}` : '—',
      method: c.project_type_name || '—',
      methodShort: c.project_type_name || '—',
      award: formatBaht(awardN),
      awardN,
      budget: formatBaht(budgetN),
      budgetN,
      ref: '—',
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

  // Market price benchmarks — only peers with service similarity > 90%
  const province = String(stub.agency.prov || '').trim();
  const projectList = Object.values(projects) as {
    name?: string;
    awardN?: number;
    workCategoryId?: WorkCategoryId;
    ref?: string;
    pct?: string;
    sevKey?: string;
    ind?: number;
    alerts?: {
      tag: string;
      title: string;
      sevKey: string;
      conf: string;
      facts: string[][];
      explain: string;
      innocent: string;
      evidence: string[];
    }[];
    priceBenchmark?: unknown;
    cat?: string;
  }[];

  for (const p of projectList) {
    const similarPeerAwards: number[] = [];
    const similarPeerUnitRates: Partial<Record<UnitRateKind, number[]>> = {};
    for (const other of projectList) {
      if (other === p) continue;
      if (!other.awardN) continue;
      if (!servicesSimilar(p.name || '', other.name || '')) continue;
      similarPeerAwards.push(other.awardN);
      const parsed = parseProjectQuantity(other.name || '');
      for (const kind of Object.keys(parsed.rates) as UnitRateKind[]) {
        const qty = parsed.rates[kind]?.qty;
        if (!qty) continue;
        const rate = unitRateFromAward(other.awardN, kind, qty);
        if (!rate) continue;
        if (!similarPeerUnitRates[kind]) similarPeerUnitRates[kind] = [];
        similarPeerUnitRates[kind]!.push(rate);
      }
    }

    const bm = resolveProjectBenchmark({
      projectName: p.name || '',
      award: p.awardN || 0,
      province,
      similarPeerAwards,
      similarPeerUnitRates,
    });
    if (!bm) continue;
    p.priceBenchmark = bm;
    p.cat = bm.categoryLabel;
    if (bm.median > 0 && bm.n >= 5) {
      p.ref =
        bm.compareMode === 'unit' && bm.unitLabel
          ? `ค่ากลาง ${Math.round(bm.median).toLocaleString('th-TH')} ${bm.unitLabel}`
          : formatBenchmarkBaht(bm.median);
      p.pct = pctLabel(bm);
    } else if (bm.unitRateLabel) {
      p.ref = 'ยังไม่มีกลุ่มคล้าย >90%';
      p.pct = '—';
    }
    if (!(bm.median > 0 && bm.n >= 5)) continue;
    const priceSev = severityFromVsMedian(bm.vsMedianPct);
    if (priceSev !== 'Low') {
      p.sevKey = p.sevKey === 'High' ? 'High' : priceSev;
      p.ind = (p.ind || 0) + 1;
      p.alerts = p.alerts || [];
      const unitFacts: string[][] =
        bm.compareMode === 'unit'
          ? [
              ['ปริมาณจากชื่องาน', bm.quantityLabel || '—'],
              ['อัตราราคาโครงการ', bm.unitRateLabel || '—'],
              [`ค่ากลางตลาด (${bm.unitLabel})`, `${Math.round(bm.median).toLocaleString('th-TH')} ${bm.unitLabel}`],
              [
                `ช่วง P25–P75 (${bm.unitLabel})`,
                `${Math.round(bm.p25).toLocaleString('th-TH')} – ${Math.round(bm.p75).toLocaleString('th-TH')} ${bm.unitLabel}`,
              ],
            ]
          : [
              ['ราคาที่ตกลง', formatBenchmarkBaht(bm.award)],
              ['ค่ากลางตลาด (median)', formatBenchmarkBaht(bm.median)],
              ['ช่วง P25–P75', `${formatBenchmarkBaht(bm.p25)} – ${formatBenchmarkBaht(bm.p75)}`],
            ];
      p.alerts.push({
        tag: bm.compareMode === 'unit' ? 'R-PRICE · ต่อหน่วย' : 'R-PRICE · ตลาด',
        title:
          bm.compareMode === 'unit'
            ? bm.vsMedianPct > 0
              ? `อัตรา${bm.unitLabel} สูงกว่าค่ากลาง「${bm.categoryLabel}」${pctLabel(bm)}`
              : `อัตรา${bm.unitLabel} ต่ำกว่าค่ากลาง「${bm.categoryLabel}」${pctLabel(bm)}`
            : bm.vsMedianPct > 0
              ? `ราคาที่ตกลงสูงกว่าค่ากลางกลุ่ม「${bm.categoryLabel}」${pctLabel(bm)}`
              : `ราคาที่ตกลงต่ำกว่าค่ากลางกลุ่ม「${bm.categoryLabel}」${pctLabel(bm)}`,
        sevKey: priceSev,
        conf: `n=${bm.n} · ${bm.scope}${bm.compareMode === 'unit' ? ' · unit' : ''}`,
        facts: [
          ...unitFacts,
          [
            'ขอบเขตเปรียบเทียบ',
            bm.scope === 'province' ? `จังหวัด${province}` : bm.scope === 'national' ? 'ทั้งประเทศ' : 'ในหน่วยงาน',
          ],
          ['ราคาทั้งสัญญา', formatBenchmarkBaht(bm.award)],
        ],
        explain: bm.note,
        innocent:
          'ความต่างจากค่ากลางอาจมาจากความกว้าง/ความหนา สเปก ทำเล หรือปริมาณจริงใน TOR — ไม่ใช่ข้อกล่าวหา',
        evidence: ['contracts-cache · price-by-category benchmarks · title quantity parse'],
      });
    }
  }

  const totalContracts = Object.values(contractors).reduce((s, co) => s + co.contracts, 0) || 1;
  for (const co of Object.values(contractors)) {
    co.shareNum = `${Math.round((co.contracts / totalContracts) * 1000) / 10}%`;
    (co as { share?: string }).share = co.shareNum;
  }

  // R6 — same winner + similar titles (ซอยสัญญา / แบ่งซื้อแบ่งจ้าง)
  const splitClusters = detectContractSplitClusters(
    Object.entries(projects).map(([id, p]) => {
      const pr = p as {
        name?: string;
        winner?: string | null;
        fy?: string;
        method?: string;
        methodShort?: string;
        awardN?: number;
        workCategoryId?: string;
      };
      return {
        id,
        name: pr.name || '',
        winner: pr.winner,
        fy: pr.fy,
        method: pr.method || pr.methodShort,
        awardN: pr.awardN,
        workCategoryId: pr.workCategoryId,
      };
    }),
    { minSize: 3 }
  );
  for (const cluster of splitClusters) {
    const peerIds = cluster.projectIds.slice(0, 8);
    for (const pid of cluster.projectIds) {
      const p = projects[pid] as {
        sevKey?: string;
        ind?: number;
        alerts?: {
          tag: string;
          title: string;
          sevKey: string;
          conf: string;
          facts: string[][];
          explain: string;
          innocent: string;
          evidence: string[];
        }[];
        related?: [string, string, string][];
        name?: string;
      };
      if (!p) continue;
      if (p.alerts?.some((a) => a.tag.startsWith('R6'))) continue;
      p.sevKey = p.sevKey === 'High' || cluster.severity === 'High' ? 'High' : cluster.severity;
      p.ind = (p.ind || 0) + 1;
      p.alerts = p.alerts || [];
      p.alerts.push({
        tag: 'R6 · กระบวนการ',
        title: `อาจมีการแบ่งซื้อแบ่งจ้าง / ซอยสัญญา (${cluster.projectIds.length} สัญญาชื่อคล้าย ผู้ชนะรายเดียว)`,
        sevKey: cluster.severity,
        conf: `n=${cluster.projectIds.length} · ปีงบ ${cluster.fy}`,
        facts: [
          ['จำนวนสัญญาในกลุ่ม', String(cluster.projectIds.length)],
          ['มูลค่ารวมกลุ่ม', formatBaht(cluster.totalAward)],
          ['ผู้ชนะ', contractors[cluster.winnerId]?.name || cluster.winnerId],
          ['ปีงบ', cluster.fy],
        ],
        explain:
          'ผู้รับจ้างรายเดียวชนะหลายสัญญาที่ชื่องานคล้ายกันมากในช่วงเวลาใกล้เคียง — รูปแบบที่พบบ่อยเมื่อซอยงานเป็นสัญญาย่อย (อาจเพื่อหลีกเลณฑ์วิธีจัดซื้อหรือกระจายงบ) ต้องเทียบ TOR/แผนงาน/ปริมาณจริง',
        innocent:
          'งานซ่อมถนนหลายสายในปีงบเดียวกันอาจใช้แม่แบบชื่อคล้ายกันได้ตามแผน — ไม่ใช่ข้อกล่าวหาโดยลำพัง',
        evidence: ['contracts-cache · title-stem clustering · R6'],
      });
      p.related = p.related || [];
      for (const otherId of peerIds) {
        if (otherId === pid) continue;
        const other = projects[otherId] as { code?: string; name?: string };
        const label = `${other?.code || otherId} · ${(other?.name || '').slice(0, 48)}`;
        if (!p.related.some((r) => r[0] === otherId)) {
          p.related.push([otherId, label, 'สัญญาชื่อคล้าย · ผู้ชนะเดียวกัน (R6)']);
        }
      }
    }
    const co = contractors[cluster.winnerId];
    if (co) {
      co.risks = co.risks || [];
      if (!co.risks.some((r) => r.tag?.startsWith('R6'))) {
        co.risks.push({
          tag: 'R6 · กระบวนการ',
          text: `ชนะ ${cluster.projectIds.length} สัญญาชื่องานคล้ายกัน (มูลค่ารวมกลุ่ม ~${formatBaht(cluster.totalAward)}) — สัญญาณอาจซอยสัญญา`,
          sevKey: cluster.severity,
        });
      }
    }
  }

  // R1-FREQ — same winner wins >5 contracts in one FY from this agency
  // (ปกติปีละ ~1–2 สัญญาก็ถือว่าเยอะแล้ว; เกิน 5 = ความเสี่ยงสูง)
  const byWinnerFy = new Map<string, { winnerId: string; fy: string; pids: string[]; total: number }>();
  for (const [pid, raw] of Object.entries(projects)) {
    const p = raw as { winner?: string | null; fy?: string; awardN?: number };
    if (!p.winner) continue;
    const fyM = String(p.fy || '').match(/(\d{4})/);
    const fy = fyM?.[1] || 'unknown';
    if (fy === 'unknown') continue;
    const key = `${p.winner}::${fy}`;
    if (!byWinnerFy.has(key)) byWinnerFy.set(key, { winnerId: p.winner, fy, pids: [], total: 0 });
    const slot = byWinnerFy.get(key)!;
    slot.pids.push(pid);
    slot.total += p.awardN || 0;
  }
  for (const slot of byWinnerFy.values()) {
    const n = slot.pids.length;
    if (n <= 5) continue; // เกิน 5 เท่านั้น
    const winnerName = contractors[slot.winnerId]?.name || slot.winnerId;
    for (const pid of slot.pids) {
      const p = projects[pid] as {
        sevKey?: string;
        ind?: number;
        alerts?: {
          tag: string;
          title: string;
          sevKey: string;
          conf: string;
          facts: string[][];
          explain: string;
          innocent: string;
          evidence: string[];
        }[];
      };
      if (!p) continue;
      if (p.alerts?.some((a) => a.tag.startsWith('R1') && a.title.includes('เกิน 5 สัญญา'))) continue;
      p.sevKey = 'High';
      p.ind = (p.ind || 0) + 1;
      p.alerts = p.alerts || [];
      p.alerts.push({
        tag: 'R1 · การแข่งขัน',
        title: `ผู้รับจ้างรายเดียวชนะเกิน 5 สัญญาในปีงบ ${slot.fy} จากหน่วยงานนี้ (${n} สัญญา)`,
        sevKey: 'High',
        conf: `n=${n} · ปีงบ ${slot.fy}`,
        facts: [
          ['ผู้ชนะ', winnerName],
          ['จำนวนสัญญาในปีงบ', String(n)],
          ['มูลค่ารวมปีงบ', formatBaht(slot.total)],
          ['ปีงบ', slot.fy],
        ],
        explain:
          'ในบริบท อปท. การที่บริษัทเดียวรับงานจากหน่วยงานเดียวเกิน 5 สัญญาต่อปีถือเป็นความถี่สูงผิดปกติ (ปกติปีละ 1–2 สัญญาก็มักถือว่าเยอะแล้ว) — ใช้จัดลำดับตรวจ ไม่ใช่ข้อกล่าวหา',
        innocent:
          'บางพื้นที่ผู้รับเหมาคุณสมบัติจำกัดหรือเป็นผู้รับจ้างต่อเนื่องตามแผนหลายสายงาน — ต้องดู TOR และการแข่งขันประกอบ',
        evidence: ['contracts-cache · winner×FY count · R1-FREQ'],
      });
    }
    const co = contractors[slot.winnerId];
    if (co) {
      co.risks = co.risks || [];
      if (!co.risks.some((r) => r.tag?.startsWith('R1') && r.text.includes('เกิน 5 สัญญา'))) {
        co.risks.push({
          tag: 'R1 · การแข่งขัน',
          text: `ชนะ ${n} สัญญาในปีงบ ${slot.fy} จากหน่วยงานนี้ (เกินเกณฑ์ 5 สัญญา/ปี) · มูลค่ารวม ~${formatBaht(slot.total)}`,
          sevKey: 'High',
        });
      }
    }
  }

  // R2 / R4 / R7 / R9–R12 / R14–R18 / R20–R25 — catalog rules from cache fields
  const catalogHits = detectCatalogRules(
    Object.entries(projects).map(([id, raw]) => {
      const p = raw as {
        name?: string;
        code?: string;
        winner?: string | null;
        fy?: string;
        method?: string;
        methodShort?: string;
        awardN?: number;
        budgetN?: number;
        announced?: string;
        _sourceUrl?: string;
        workCategoryId?: string;
        priceBenchmark?: {
          p75?: number;
          median?: number;
          vsMedianPct?: number;
          compareMode?: string;
          unitLabel?: string;
          scope?: string;
          n?: number;
        };
      };
      return {
        id,
        name: p.name || '',
        code: p.code,
        winner: p.winner,
        fy: p.fy,
        method: p.method || p.methodShort,
        awardN: p.awardN,
        budgetN: p.budgetN,
        announced: p.announced,
        sourceUrl: p._sourceUrl || null,
        workCategoryId: p.workCategoryId,
        priceBenchmark: p.priceBenchmark || null,
      };
    }),
    Object.entries(contractors).map(([id, co]) => ({
      id,
      name: co.name,
      contracts: co.contracts,
      totalN: co.totalN,
      reg: co.reg,
    }))
  );
  for (const [pid, alerts] of catalogHits.projectAlerts) {
    const p = projects[pid] as {
      sevKey?: string;
      ind?: number;
      alerts?: {
        tag: string;
        title: string;
        sevKey: string;
        conf: string;
        facts: string[][];
        explain: string;
        innocent: string;
        evidence: string[];
      }[];
    };
    if (!p) continue;
    p.alerts = p.alerts || [];
    for (const a of alerts) {
      if (p.alerts.some((x) => x.tag === a.tag && x.title === a.title)) continue;
      p.alerts.push(a);
      p.ind = (p.ind || 0) + 1;
      if (a.sevKey === 'High') p.sevKey = 'High';
      else if (a.sevKey === 'Medium' && p.sevKey !== 'High') p.sevKey = 'Medium';
    }
  }
  for (const [cid, risks] of catalogHits.contractorRisks) {
    const co = contractors[cid];
    if (!co) continue;
    co.risks = co.risks || [];
    for (const r of risks) {
      if (!co.risks.some((x) => x.tag === r.tag && x.text === r.text)) co.risks.push(r);
    }
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
  // Prefer catalog อำเภอ — contract เขต/อำเภอ is often the tambon name (e.g. "ป่าไผ่")
  const contractDist = distRanked[0]?.[0] || '';
  const primaryDist =
    stub.agency.dist ||
    (contractDist && contractDist !== stub.agency.th.replace(/^เทศบาล(ตำบล|เมือง|นคร)/, '').trim()
      ? contractDist
      : '') ||
    '';
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

  const parseAward = (s: unknown) => {
    const n = Number(String(s || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const priorityOrder = Object.entries(projects)
    .map(([id, raw]) => {
      const p = raw as { winner?: string | null; award?: string; alerts?: unknown[] };
      return {
        id,
        hasWinner: p.winner ? 1 : 0,
        award: parseAward(p.award),
        alerts: Array.isArray(p.alerts) ? p.alerts.length : 0,
      };
    })
    .sort((a, b) => b.hasWinner - a.hasWinner || b.alerts - a.alerts || b.award - a.award)
    .slice(0, 8)
    .map((x) => x.id);

  const firstPid = priorityOrder[0] || Object.keys(projects).slice(0, 1)[0] || '';
  const firstCid =
    (firstPid && (projects[firstPid] as { winner?: string | null })?.winner) ||
    topContractors[0]?.id ||
    Object.keys(contractors).slice(0, 1)[0] ||
    '';

  const uiGraph = buildUiEntityGraph({
    agency: stub.agency,
    projects: projects as Record<string, { code?: string; name?: string; winner?: string | null; winnerId?: string | null; award?: string; method?: string; year?: string }>,
    contractors,
    relatedMatches: (stub as { relatedParty?: { matches?: unknown[] } }).relatedParty?.matches as
      | undefined,
    preferProjectIds: priorityOrder,
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
          : 'ข้อมูลสัญญาจากแคช egp-contact (คอลัมน์ผู้ชนะถูก normalize แล้ว)'
        : stub.meta.dataGapNote,
      catalogOnly: Object.keys(projects).length === 0,
      packageId,
      priorityNote: Object.keys(projects).length
        ? `เรียงโครงการที่มีผู้ชนะ/มูลค่า · ${Math.min(8, Object.keys(projects).length)} จาก ${Object.keys(projects).length} โครงการ`
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
    priorityOrder,
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
    clusters: buildUiClusters({ contractors }),
    caseFile: {
      id: `case-${stub.agency.id}`,
      title: stub.agency.th,
      summary: `รายงานเบื้องต้นจากทะเบียน e-GP + สัญญา data.go.th (${Object.keys(projects).length} โครงการ)`,
      status: Object.keys(projects).length ? 'มีข้อมูลสัญญา' : 'ทะเบียนเท่านั้น',
      opened: 'เปิดจากสแกนสาธารณะ',
      owner: 'รอมอบหมายผู้ตรวจ',
      signals: 'คะแนนความเสี่ยงจะคำนวณเมื่อเปิดผู้ช่วยสอบสวน — ไม่ใช่ข้อกล่าวหา',
      evidence: [govSpendingPortalSearchUrl(stub.agency.th)],
      questions: [] as [string, string][],
      timeline: [] as [string, string, string][],
      parties: Object.entries(contractors)
        .slice(0, 8)
        .map(([cid, co]) => [co.name, `${co.contracts} สัญญา · ${co.total}`, true] as [string, string, boolean]),
      money: Object.entries(projects)
        .slice(0, 8)
        .map(([, p]) => {
          const proj = p as { code?: string; name?: string; award?: string };
          return [String(proj.code || proj.name || 'โครงการ'), String(proj.award || '—'), false] as [
            string,
            string,
            boolean,
          ];
        }),
      notes: [] as [string, string][],
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
      const hasCacheHit = /contracts-cache/i.test(notes);
      const cacheEmpty = hasCacheHit && /empty/i.test(notes);
      const liveBlocked = /403|blocked/i.test(notes);
      const cacheMiss = !hasCacheHit;
      return {
        ...stub,
        meta: {
          ...stub.meta,
          scanSummary: cacheEmpty
            ? `อยู่ในทะเบียน e-GP · ไม่พบสัญญาใน egp-contact ปี 2568 ภายใต้ชื่อหน่วยงานนี้`
            : cacheMiss
              ? `อยู่ในทะเบียน e-GP · ยังไม่มีสัญญาในแคชสำหรับหน่วยงานนี้ (estimate ${totalEstimate})`
              : `อยู่ในทะเบียน e-GP · ค้นสัญญาแล้วยังไม่เจอที่ตรงชื่อ (estimate ${totalEstimate})`,
          dataGapNote: cacheEmpty
            ? `${notes} — หน่วยย่อยบางแห่งไม่มีสัญญาแยกใน egp-contact ลองค้นหน่วยงานแม่ (เช่น มหาวิทยาลัยอุบลราชธานี)`
            : cacheMiss || liveBlocked
              ? `Production อ่านจาก contracts-cache — รัน sync-contracts-cache จากเครือข่ายไทยแล้ว commit แคช${notes ? ` · ${notes}` : ''}`
              : notes || stub.meta.dataGapNote,
        },
      };
    }
    const enriched = enrichStubWithContracts(stub, use, packageId);

    // Auto-fetch e-GP winner announcements only when cache didn't already supply winners
    // (keeps scan budget for website executive auto-fetch on Vercel)
    const fromContractsCache = (fetchNotes || []).some((n) => /contracts-cache/i.test(n));
    const projectList = Object.values(enriched.projects || {}) as { winner?: string | null }[];
    const missingWinners = projectList.filter((p) => !p.winner).length;
    if (missingWinners > 0 && !fromContractsCache) {
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
