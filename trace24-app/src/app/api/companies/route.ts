import { companyMasterStats, listCompanies } from '@/lib/companies/store';
import { normalizeTin } from '@/lib/companies/types';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const tinQ = normalizeTin(searchParams.get('tin') || q);
  const limit = Math.min(500, Number(searchParams.get('limit') || 80) || 80);

  let companies = listCompanies(Math.max(limit, 200));
  if (tinQ) {
    companies = companies.filter((c) => c.tin === tinQ);
  } else if (q) {
    companies = companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.aliases.some((a) => a.toLowerCase().includes(q)) ||
        c.tin.includes(q.replace(/\D/g, ''))
    );
  }

  return Response.json({
    generatedAt: new Date().toISOString(),
    strategy:
      'Open-DBD path: เลขนิติบุคคล = PK · seed จาก contracts-cache · enrich แหล่งเปิด · BDEX API ขั้นถัดไป · ไม่ scrape DBD DataWarehouse เป็นหลัก',
    stats: companyMasterStats(),
    count: companies.slice(0, limit).length,
    companies: companies.slice(0, limit),
  });
}
