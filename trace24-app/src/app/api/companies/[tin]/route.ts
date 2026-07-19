import { companyToRelated } from '@/lib/companies/bridge';
import { loadCompany, upsertCompany } from '@/lib/companies/store';
import { normalizeTin } from '@/lib/companies/types';
import type { CompanyPerson } from '@/lib/pipeline/related-party';

type Ctx = { params: Promise<{ tin: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { tin: raw } = await ctx.params;
  const tin = normalizeTin(raw);
  if (!tin) return Response.json({ error: 'invalid tin — need 13 digits' }, { status: 400 });
  const company = loadCompany(tin);
  if (!company) return Response.json({ error: 'company not found in master' }, { status: 404 });
  return Response.json({
    company,
    relatedShape: companyToRelated(company),
    strategy: 'TIN primary key · Open-DBD shaped master',
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { tin: raw } = await ctx.params;
  const tin = normalizeTin(raw);
  if (!tin) return Response.json({ error: 'invalid tin — need 13 digits' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    address?: string;
    directors?: CompanyPerson[];
    registeredAt?: string | null;
    registeredCapital?: number | null;
    note?: string;
    confidence?: 'draft' | 'open_dbd' | 'bdex';
  };

  const updated = upsertCompany({
    tin,
    name: body.name,
    address: body.address,
    directors: body.directors,
    registeredAt: body.registeredAt,
    registeredCapital: body.registeredCapital,
    note: body.note,
    confidence: body.confidence || 'open_dbd',
    sources: [
      {
        kind: 'manual',
        fetchedAt: new Date().toISOString(),
        note: 'PATCH /api/companies/[tin]',
      },
    ],
  });

  if (!updated) return Response.json({ error: 'upsert failed' }, { status: 400 });
  return Response.json({ ok: true, company: updated });
}
