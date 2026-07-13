/**
 * data.go.th CKAN + ภาษีไปไหน contract CSVs (datastore_search, no API key).
 */

const UA = {
  'User-Agent': 'TRACE24/1.0',
  Accept: 'application/json',
} as const;

export type CkanPackageSummary = {
  id: string;
  title: string;
  notes: string;
  resources: { id: string; name: string; format: string; url: string; datastore: boolean }[];
};

async function ckanAction<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params);
  const r = await fetch(`https://data.go.th/api/3/action/${action}?${qs}`, { headers: UA });
  const data = await r.json();
  if (!r.ok || data.success === false) {
    throw new Error(data?.error?.message || `CKAN ${action} HTTP ${r.status}`);
  }
  return data.result as T;
}

export async function searchDataGoTh(query: string, rows = 10) {
  const result = await ckanAction<{
    count: number;
    results: Array<{
      name: string;
      title: string;
      notes?: string;
      resources?: Array<{ id: string; name: string; format: string; url: string; datastore_active?: boolean }>;
    }>;
  }>('package_search', { q: query, rows: String(rows) });

  return {
    count: result.count || 0,
    packages: (result.results || []).map(
      (p): CkanPackageSummary => ({
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
      })
    ),
  };
}

export type GovSpendingContract = {
  project_id: string;
  project_name: string;
  project_money: string;
  project_type_name: string;
  dept_name: string;
  province: string;
  _fy: string;
  _source: string;
  contract: { winner: string; winner_tin: string; price_agree: string; contract_date: string }[];
};

function mapRow(row: Record<string, unknown>): GovSpendingContract {
  const projectMoney = row['งบประมาณ(บาท)'];
  const price = row['ราคาตกลงซื้อ/จ้าง'] ?? row['งบสัญญา(บาท)'];
  let winner = String(row['ชื่อผู้ชนะ'] ?? '').trim();
  if (/^\d{1,2}\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/.test(winner)) {
    winner = '';
  }
  return {
    project_id: String(row['รหัสโครงการ'] ?? ''),
    project_name: String(row['ชื่อโครงการ'] ?? ''),
    project_money: projectMoney != null ? String(projectMoney) : '',
    project_type_name: String(row['กลุ่มวิธีจัดซื้อฯ'] || row['วิธีจัดซื้อฯ'] || ''),
    dept_name: String(row['ชื่อหน่วยงาน'] ?? ''),
    province: String(row['จังหวัด'] ?? ''),
    _fy: String(row['ปีงบประมาณ'] ?? ''),
    _source: 'data.go.th/govspending-ckan',
    contract: [
      {
        winner,
        winner_tin: String(row['เลขนิติบุคคล'] ?? '').trim(),
        price_agree: price != null ? String(price) : '',
        contract_date: String(row['วันที่ลงนามสัญญา'] || row['วันที่ประกาศ'] || ''),
      },
    ],
  };
}

export async function fetchGovSpendingContracts(
  keyword: string,
  opts: { packageId?: string; limit?: number } = {}
): Promise<{ contracts: GovSpendingContract[]; packageId: string; totalEstimate: number }> {
  const packageId = opts.packageId || 'egp-contact-2568';
  const limit = opts.limit ?? 50;
  const pkg = await ckanAction<{
    resources: Array<{ id: string; name: string; datastore_active?: boolean }>;
  }>('package_show', { id: packageId });

  const contracts: GovSpendingContract[] = [];
  let totalEstimate = 0;

  for (const res of pkg.resources || []) {
    if (!res.datastore_active) continue;
    const qs = new URLSearchParams({
      resource_id: res.id,
      q: keyword,
      limit: String(Math.min(100, limit - contracts.length)),
      offset: '0',
    });
    const r = await fetch(`https://data.go.th/api/3/action/datastore_search?${qs}`, { headers: UA });
    const data = await r.json();
    if (!data.success) continue;
    const records = (data.result?.records || []) as Record<string, unknown>[];
    totalEstimate += Number(data.result?.total || 0);
    for (const row of records) {
      const mapped = mapRow(row);
      if (mapped.dept_name === keyword || mapped.dept_name.includes(keyword)) {
        contracts.push(mapped);
      }
      if (contracts.length >= limit) break;
    }
    if (contracts.length >= limit) break;
  }

  return { contracts, packageId, totalEstimate };
}

export function govSpendingPortalSearchUrl(keyword: string) {
  return `https://govspending.data.go.th/#/search?keyword=${encodeURIComponent(keyword)}`;
}
