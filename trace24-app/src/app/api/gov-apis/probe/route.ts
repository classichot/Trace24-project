import { fetchCgdContracts, searchDataGoTh } from '@/lib/gov-apis/opend';
import { fetchBotExchangeRateDaily } from '@/lib/gov-apis/bot';

export async function GET() {
  const opendKey = process.env.OPEND_API_KEY?.trim();
  const botToken = process.env.BOT_API_TOKEN?.trim();

  const year = new Date().getFullYear() - 1;
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  const [ckan, opend, bot] = await Promise.all([
    searchDataGoTh('จัดซื้อจัดจ้าง', 3)
      .then((data) => ({ ok: true as const, note: 'CKAN package_search OK', count: data?.result?.count ?? null }))
      .catch((e: Error) => ({ ok: false as const, note: e.message })),
    opendKey
      ? fetchCgdContracts({ apiKey: opendKey, year, keyword: 'เทศบาล', limit: 5 })
      : Promise.resolve({ ok: false as const, status: 0, error: 'OPEND_API_KEY missing', bodyPreview: '' }),
    botToken
      ? fetchBotExchangeRateDaily({ token: botToken, startPeriod: ymd(start), endPeriod: ymd(end) })
      : Promise.resolve({ ok: false as const, status: 0, error: 'BOT_API_TOKEN missing', bodyPreview: '' }),
  ]);

  return Response.json({
    probedAt: new Date().toISOString(),
    dataGoThCkan: ckan,
    openD: opend.ok
      ? { ok: true, status: opend.status }
      : { ok: false, status: 'status' in opend ? opend.status : 0, error: 'error' in opend ? opend.error : 'failed', bodyPreview: 'bodyPreview' in opend ? opend.bodyPreview : '' },
    bot: bot.ok
      ? { ok: true, status: bot.status }
      : { ok: false, status: 'status' in bot ? bot.status : 0, error: 'error' in bot ? bot.error : 'failed', bodyPreview: 'bodyPreview' in bot ? bot.bodyPreview : '' },
  });
}
