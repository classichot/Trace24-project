import { fetchGovSpendingContracts, govSpendingPortalSearchUrl, searchDataGoTh } from '@/lib/gov-apis/govspending';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keyword = (searchParams.get('keyword') || searchParams.get('q') || '').trim();
  const mode = searchParams.get('mode') || 'contracts';
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || 40)));

  if (!keyword) {
    return Response.json({ error: 'keyword required' }, { status: 400 });
  }

  if (mode === 'packages') {
    const packages = await searchDataGoTh(keyword, limit);
    return Response.json({
      keyword,
      portal: govSpendingPortalSearchUrl(keyword),
      ...packages,
    });
  }

  const result = await fetchGovSpendingContracts(keyword, { limit });
  return Response.json({
    keyword,
    portal: govSpendingPortalSearchUrl(keyword),
    packageId: result.packageId,
    totalEstimate: result.totalEstimate,
    count: result.contracts.length,
    contracts: result.contracts,
  });
}
