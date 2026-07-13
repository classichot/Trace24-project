/**
 * Bank of Thailand public API client (citizen-registerable token).
 * Portal: https://portal.api.bot.or.th / https://apiportal.bot.or.th/bot/public/
 *
 * Exact paths vary by product — this client probes the common exchange-rate style endpoint
 * and returns structured errors if the portal changes.
 */

export type BotRateQuery = {
  token: string;
  startPeriod: string; // YYYY-MM-DD
  endPeriod: string;
};

export type BotFetchResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string; bodyPreview: string };

export async function fetchBotExchangeRateDaily(q: BotRateQuery): Promise<BotFetchResult> {
  // Public documentation historically uses apigw style hosts; try current portal path pattern.
  const url =
    `https://apigw1.bot.or.th/bot/public/Stat-ExchangeRate/v2/DAILY_AVG_EXG_RATE/` +
    `?start_period=${encodeURIComponent(q.startPeriod)}&end_period=${encodeURIComponent(q.endPeriod)}`;

  try {
    const r = await fetch(url, {
      headers: {
        'X-BOT-API-KEY': q.token,
        Accept: 'application/json',
        'User-Agent': 'TRACE24/1.0',
      },
    });
    const text = await r.text();
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error: `BOT HTTP ${r.status}`,
        bodyPreview: text.slice(0, 200).replace(/\s+/g, ' '),
      };
    }
    try {
      return { ok: true, status: r.status, data: JSON.parse(text) };
    } catch {
      return {
        ok: false,
        status: r.status,
        error: 'BOT returned non-JSON',
        bodyPreview: text.slice(0, 200).replace(/\s+/g, ' '),
      };
    }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : 'fetch failed',
      bodyPreview: '',
    };
  }
}
