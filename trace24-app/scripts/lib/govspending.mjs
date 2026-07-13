/**
 * data.go.th CKAN + ภาษีไปไหน (e-GP contract CSVs published on the open data portal).
 * Uses datastore_search — no API key required.
 */

const UA = { 'User-Agent': 'TRACE24/1.0 (public-sector research demo)', Accept: 'application/json' };

/** Prefer annual packages with reliable winner columns; 2568 datastore often shifts winner fields. */
export const GOVSPENDING_CKAN_PACKAGES = ['egp-contact-2568', 'cgd-contract-2562'];

const THAI_DATE_RE =
  /^\d{1,2}\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\.?\s*\d{2,4}$/;

export function looksLikeThaiDate(value) {
  const s = String(value || '').trim();
  return THAI_DATE_RE.test(s) || /^\d{1,2}-[ก-๙A-Za-z\.]+\-\d{2,4}$/.test(s);
}

export async function ckanAction(action, params = {}) {
  const qs = new URLSearchParams(params);
  const url = `https://data.go.th/api/3/action/${action}?${qs}`;
  const r = await fetch(url, { headers: UA });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`CKAN ${action} non-JSON HTTP ${r.status}`);
  }
  if (!r.ok || data.success === false) {
    throw new Error(`CKAN ${action} failed: ${data?.error?.message || r.status}`);
  }
  return data.result;
}

export async function searchDataGoThPackages(query, rows = 10) {
  const result = await ckanAction('package_search', { q: query, rows: String(rows) });
  return {
    count: result.count || 0,
    packages: (result.results || []).map((p) => ({
      id: p.name,
      title: p.title,
      notes: (p.notes || '').slice(0, 240),
      resources: (p.resources || []).map((r) => ({
        id: r.id,
        name: r.name,
        format: r.format,
        url: r.url,
        datastore: !!r.datastore_active,
      })),
    })),
  };
}

export async function listPackageDatastoreResources(packageId) {
  const pkg = await ckanAction('package_show', { id: packageId });
  return (pkg.resources || [])
    .filter((r) => r.datastore_active)
    .map((r) => ({
      id: r.id,
      name: r.name,
      format: r.format,
      url: r.url,
      packageId: pkg.name,
      packageTitle: pkg.title,
    }));
}

/**
 * Free-text search across all datastore resources of a package.
 * Prefer exact agency name as keyword (e.g. เทศบาลตำบลโพทะเล).
 */
export async function datastoreSearchPackage(packageId, keyword, { limitPerResource = 100, maxTotal = 500 } = {}) {
  const resources = await listPackageDatastoreResources(packageId);
  const records = [];
  const meta = { packageId, resourcesQueried: 0, totals: [] };

  for (const res of resources) {
    meta.resourcesQueried++;
    let offset = 0;
    while (records.length < maxTotal) {
      const qs = new URLSearchParams({
        resource_id: res.id,
        q: keyword,
        limit: String(limitPerResource),
        offset: String(offset),
      });
      const r = await fetch(`https://data.go.th/api/3/action/datastore_search?${qs}`, { headers: UA });
      const data = await r.json();
      if (!data.success) break;
      const batch = data.result?.records || [];
      const total = data.result?.total ?? batch.length;
      if (offset === 0) meta.totals.push({ resource: res.name, total });
      for (const row of batch) {
        if (records.length >= maxTotal) break;
        records.push({ ...row, _resourceId: res.id, _packageId: packageId });
      }
      if (!batch.length || batch.length < limitPerResource || offset + batch.length >= total) break;
      offset += limitPerResource;
      await new Promise((x) => setTimeout(x, 80));
    }
  }
  return { records, meta };
}

/** Map Thai CKAN / ภาษีไปไหน row → Open D-like contract shape for enrichWithEgpContracts */
export function mapGovSpendingRowToContract(row) {
  const projectMoney = row['งบประมาณ(บาท)'] ?? row.project_money;
  const price = row['ราคาตกลงซื้อ/จ้าง'] ?? row['งบสัญญา(บาท)'] ?? row.price_agree;
  let winner = String(row['ชื่อผู้ชนะ'] ?? row.winner ?? '').trim();
  if (looksLikeThaiDate(winner) || /^\d{1,2}\s*ก\.ย\./.test(winner)) winner = '';
  const tin = row['เลขนิติบุคคล'] ?? row.winner_tin ?? '';
  const method = row['กลุ่มวิธีจัดซื้อฯ'] || row['วิธีจัดซื้อฯ'] || row.project_type_name || '';
  const fy = String(row['ปีงบประมาณ'] ?? row._fy ?? '');
  return {
    project_id: String(row['รหัสโครงการ'] ?? row.project_id ?? ''),
    project_name: row['ชื่อโครงการ'] ?? row.project_name ?? '',
    project_money: projectMoney != null ? String(projectMoney) : '',
    project_type_name: method,
    dept_name: row['ชื่อหน่วยงาน'] ?? row.dept_name ?? '',
    province: row['จังหวัด'] ?? '',
    district: row['เขต/อำเภอ'] ?? '',
    _fy: fy,
    _source: 'data.go.th/govspending-ckan',
    _packageId: row._packageId,
    contract: [
      {
        winner,
        winner_tin: String(tin || '').trim(),
        price_agree: price != null ? String(price) : '',
        contract_date: row['วันที่ลงนามสัญญา'] || row['วันที่ประกาศ'] || '',
        contract_no: row['เลขที่สัญญา'] || '',
      },
    ],
  };
}

/**
 * Resolve which annual packages exist, then pull contracts for an agency keyword.
 */
export async function fetchGovSpendingFromDataGoTh({
  keyword,
  packageIds = GOVSPENDING_CKAN_PACKAGES,
  maxTotal = 800,
} = {}) {
  const discovered = [];
  for (const id of packageIds) {
    try {
      await ckanAction('package_show', { id });
      discovered.push(id);
    } catch {
      /* package missing */
    }
  }

  // Discover egp-contact-* and cgd-contract-* packages
  try {
    for (const q of ['egp-contact', 'cgd-contract']) {
      const hit = await searchDataGoThPackages(q, 15);
      for (const p of hit.packages) {
        if (/^(egp-contact|cgd-contract)-\d{4}$/i.test(p.id) && !discovered.includes(p.id)) {
          discovered.push(p.id);
        }
      }
    }
  } catch {
    /* ignore */
  }

  // Prefer newer egp-contact first, then cgd-contract (often better winner columns)
  discovered.sort((a, b) => {
    const score = (id) => {
      const year = Number(id.match(/(\d{4})$/)?.[1] || 0);
      const boost = id.startsWith('egp-contact') ? 10000 : 0;
      return boost + year;
    };
    return score(b) - score(a);
  });
  // Cap packages to keep ingest snappy (newest first)
  const capped = discovered.slice(0, 5);
  discovered.length = 0;
  discovered.push(...capped);

  const all = [];
  const packageMeta = [];
  let remaining = maxTotal;
  for (const packageId of discovered) {
    if (remaining <= 0) break;
    try {
      const { records, meta } = await datastoreSearchPackage(packageId, keyword, { maxTotal: remaining });
      const mapped = records.map(mapGovSpendingRowToContract);
      // Keep rows for the agency; drop only if dept doesn't match
      const exact = mapped.filter((c) => c.dept_name === keyword);
      const use = (exact.length ? exact : mapped.filter((c) => c.dept_name.includes(keyword))).filter(
        (c) => c.project_name && (c.project_money || c.contract[0]?.price_agree)
      );
      all.push(...use);
      remaining = Math.max(0, maxTotal - all.length);
      packageMeta.push({ ...meta, matched: use.length });
      console.log(`data.go.th ${packageId}: ${use.length} contracts for "${keyword}"`);
    } catch (e) {
      console.warn(`data.go.th ${packageId} skipped:`, e.message);
    }
  }

  // Dedupe by project_id + contract_no
  const seen = new Set();
  const unique = [];
  for (const c of all) {
    const k = `${c.project_id}|${c.contract[0]?.contract_no || ''}|${c.contract[0]?.winner || ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(c);
  }

  return { contracts: unique, packages: packageMeta, discovered };
}

export function govSpendingPortalUrl(keyword) {
  return `https://govspending.data.go.th/#/search?keyword=${encodeURIComponent(keyword)}`;
}

export function govSpendingBetaUrl() {
  return 'https://govspendingbeta.data.go.th/budget';
}
