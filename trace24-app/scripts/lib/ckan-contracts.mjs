/**
 * Shared CKAN egp-contact fetch for contracts cache scripts.
 * Must run from a network that can reach data.go.th (often blocked from Vercel/GitHub-hosted runners).
 */
export const EGP_CONTACT_RESOURCES = [
  'e4eaa1b4-eb1a-4534-b227-988ee25b898d',
  '9ae119c4-73b9-4bb6-9b71-7b355269bc00',
  '1c1a90af-2d47-4bfb-ae87-e479b2582257',
  'c2385bd6-7e2a-40c2-94d8-6a65824c9415',
  'bb538ac1-3455-446d-b975-d709d6439e72',
  '5b98d6ba-0f66-4bb1-b8db-9b9aae928171',
  '037adcca-b349-44f6-9686-9fd1e9182227',
  '26316135-a95f-40e3-b2e8-1c912046c0ed',
  '882332c4-1f60-4db7-9962-9062eb08f6c4',
  '35961821-d945-4fc0-8ce1-a96b4cd46bd6',
];

const UA = {
  'User-Agent': 'TRACE24/1.2 (contracts-cache sync; public-sector research)',
  Accept: 'application/json',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch all matching rows for a department name, with pagination per resource.
 * If `prov` is set, keep only rows in that province (for duplicate names).
 */
export async function fetchContractsForAgency(keyword, opts = {}) {
  const pageSize = opts.pageSize ?? 100;
  const maxPerResource = opts.maxPerResource ?? 500;
  const prov = opts.prov || '';
  const rows = [];
  const errors = [];

  for (const resourceId of EGP_CONTACT_RESOURCES) {
    let offset = 0;
    let got = 0;
    while (got < maxPerResource) {
      const qs = new URLSearchParams({
        resource_id: resourceId,
        filters: JSON.stringify({ ชื่อหน่วยงาน: keyword }),
        limit: String(pageSize),
        offset: String(offset),
      });
      let res;
      try {
        res = await fetch(`https://data.go.th/api/3/action/datastore_search?${qs}`, {
          headers: UA,
        });
      } catch (e) {
        errors.push(`${resourceId.slice(0, 8)}: ${e.message || 'fetch error'}`);
        break;
      }
      if (res.status === 403) {
        errors.push(`${resourceId.slice(0, 8)}: HTTP 403 (IP blocked)`);
        break;
      }
      const j = await res.json().catch(() => null);
      if (!j?.success) {
        errors.push(`${resourceId.slice(0, 8)}: ${j?.error?.message || res.status}`);
        break;
      }
      const batch = j.result?.records || [];
      if (!batch.length) break;
      rows.push(...batch);
      got += batch.length;
      offset += batch.length;
      const total = Number(j.result?.total || 0);
      if (offset >= total || batch.length < pageSize) break;
      await sleep(40);
    }
    await sleep(30);
  }

  let filtered = rows;
  if (prov) {
    const byProv = rows.filter((r) => String(r['จังหวัด'] || '').trim() === prov);
    if (byProv.length) filtered = byProv;
  }

  // Dedupe by project id when present
  const seen = new Set();
  const deduped = [];
  for (const r of filtered) {
    const key = String(r['รหัสโครงการ'] || r._id || JSON.stringify(r).slice(0, 120));
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  return { rows: deduped, errors, rawCount: rows.length };
}
