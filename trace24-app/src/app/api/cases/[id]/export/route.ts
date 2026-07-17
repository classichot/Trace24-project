import { getCase } from '@/lib/cases/store';
import {
  buildOfficialDossierHtml,
  buildOfficialDossierMarkdown,
} from '@/lib/cases/official-dossier';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = getCase(id);
  if (!c) return Response.json({ error: 'case not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const format = (searchParams.get('format') || 'html').toLowerCase();

  if (format === 'md' || format === 'markdown') {
    const md = buildOfficialDossierMarkdown(c);
    return new Response(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="trace24-dossier-${c.id}.md"`,
      },
    });
  }

  const html = buildOfficialDossierHtml(c);
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
