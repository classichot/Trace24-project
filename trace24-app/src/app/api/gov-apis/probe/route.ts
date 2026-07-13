import { fetchCgdContracts } from '@/lib/gov-apis/opend';
import { fetchBotExchangeRateDaily } from '@/lib/gov-apis/bot';
import { fetchGovSpendingContracts, searchDataGoTh } from '@/lib/gov-apis/govspending';

export async function GET() {
  const opendKey = process.env.OPEND_API_KEY?.trim();
  const botToken = process.env.BOT_API_TOKEN?.trim();
  const year = new Date().getFullYear() - 1;
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const sampleAgency = 'เทศบาลตำบลโพทะเล';

  const [ckan, govspending, opend, bot] = await Promise.all([
    searchDataGoTh('egp-contact', 3)
      .then((data) => ({ ok: true as const, note: 'CKAN package_search OK', count: data.count }))
      .catch((e: Error) => ({ ok: false as const, note: e.message })),
    fetchGovSpendingContracts(sampleAgency, { limit: 5 })
      .then((data) => ({
        ok: true as const,
        note: 'ภาษีไปไหน datastore OK',
        count: data.contracts.length,
        totalEstimate: data.totalEstimate,
        packageId: data.packageId,
      }))
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
    govSpending: govspending,
    openD: opend.ok
      ? { ok: true, status: opend.status }
      : {
          ok: false,
          status: 'status' in opend ? opend.status : 0,
          error: 'error' in opend ? opend.error : 'failed',
          bodyPreview: 'bodyPreview' in opend ? opend.bodyPreview : '',
        },
    bot: bot.ok
      ? { ok: true, status: bot.status }
      : {
          ok: false,
          status: 'status' in bot ? bot.status : 0,
          error: 'error' in bot ? bot.error : 'failed',
          bodyPreview: 'bodyPreview' in bot ? bot.bodyPreview : '',
        },
  });
}
