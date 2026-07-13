#!/usr/bin/env node
/**
 * TRACE24 Thai Gov APIs MCP (stdio)
 * Tools: list_catalog, search_data_go_th, fetch_opend_contracts, fetch_bot_fx
 *
 * Env: OPEND_API_KEY, BOT_API_TOKEN (optional)
 * Run: node index.mjs   (after npm install in this folder)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const CATALOG = [
  { id: 'opend-data', fit: 'core', name: 'Open D cgdcontract', auth: 'OPEND_API_KEY' },
  { id: 'data-go-th-ckan', fit: 'core', name: 'data.go.th CKAN', auth: 'none' },
  { id: 'egp-announce-html', fit: 'core', name: 'e-GP / municipal HTML', auth: 'none' },
  { id: 'bot-api', fit: 'adjacent', name: 'BOT FX / rates', auth: 'BOT_API_TOKEN' },
  { id: 'gdx-egov', fit: 'not_fit', name: 'api.egov.go.th GDX', auth: 'agency Consumer-Key' },
];

async function searchDataGoTh(query, rows = 10) {
  const url = `https://data.go.th/api/3/action/package_search?q=${encodeURIComponent(query)}&rows=${rows}`;
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'TRACE24-MCP/1.0' } });
  if (!r.ok) throw new Error(`data.go.th ${r.status}`);
  return r.json();
}

async function fetchOpend({ year, keyword, limit }) {
  const key = process.env.OPEND_API_KEY;
  if (!key) throw new Error('OPEND_API_KEY not set');
  const params = new URLSearchParams({
    'api-key': key,
    year: String(year || new Date().getFullYear() - 1),
    offset: '0',
    limit: String(limit || 10),
  });
  if (keyword) params.set('keyword', keyword);
  const url = `https://opend.data.go.th/govspending/cgdcontract?${params}`;
  const r = await fetch(url, {
    headers: { Accept: 'application/json', 'api-key': key, 'User-Agent': 'TRACE24-MCP/1.0' },
  });
  const text = await r.text();
  return { status: r.status, body: text.slice(0, 8000) };
}

async function fetchBotFx({ startPeriod, endPeriod }) {
  const token = process.env.BOT_API_TOKEN;
  if (!token) throw new Error('BOT_API_TOKEN not set');
  const url =
    `https://apigw1.bot.or.th/bot/public/Stat-ExchangeRate/v2/DAILY_AVG_EXG_RATE/` +
    `?start_period=${encodeURIComponent(startPeriod)}&end_period=${encodeURIComponent(endPeriod)}`;
  const r = await fetch(url, {
    headers: { 'X-BOT-API-KEY': token, Accept: 'application/json', 'User-Agent': 'TRACE24-MCP/1.0' },
  });
  const text = await r.text();
  return { status: r.status, body: text.slice(0, 8000) };
}

const server = new Server({ name: 'trace24-thai-gov', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_catalog',
      description: 'List Thai gov APIs suitable for TRACE24 (core / adjacent / not_fit)',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'search_data_go_th',
      description: 'CKAN package_search on data.go.th (no API key)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          rows: { type: 'number' },
        },
        required: ['query'],
      },
    },
    {
      name: 'fetch_opend_contracts',
      description: 'Fetch Open D govspending/cgdcontract (needs OPEND_API_KEY; often 404)',
      inputSchema: {
        type: 'object',
        properties: {
          year: { type: 'number' },
          keyword: { type: 'string' },
          limit: { type: 'number' },
        },
      },
    },
    {
      name: 'fetch_bot_fx',
      description: 'Fetch BOT daily average FX (needs BOT_API_TOKEN)',
      inputSchema: {
        type: 'object',
        properties: {
          startPeriod: { type: 'string', description: 'YYYY-MM-DD' },
          endPeriod: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['startPeriod', 'endPeriod'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments || {};
  try {
    let payload;
    if (name === 'list_catalog') payload = CATALOG;
    else if (name === 'search_data_go_th') payload = await searchDataGoTh(args.query, args.rows);
    else if (name === 'fetch_opend_contracts') payload = await fetchOpend(args);
    else if (name === 'fetch_bot_fx') payload = await fetchBotFx(args);
    else throw new Error(`Unknown tool: ${name}`);
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
