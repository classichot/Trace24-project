# TRACE24

Public procurement integrity scanner for Thai agencies (อปท. / เทศบาล and broader e-GP catalog).

Live production: https://trace24-app.vercel.app

## What it does

1. Search the national agency catalog (e-GP department codes)
2. Scan → build a live report from **committed contracts-cache** (ภาษีไปไหน / data.go.th mirror)
3. Surface risk signals **R1–R26** (review priority only — not proof of misconduct)
4. Compare award prices to **market peer medians** from the same cache (**not** official ราคากลาง)
5. Optional related-party assists (exec roster crawl, director paste/cascade) + Hybrid Graph RAG / LLM

## Run locally

```bash
cd trace24-app
npm install
cp .env.example .env.local   # add OPENAI_API_KEY / TRACE24_ADMIN_TOKEN as needed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` or `LLM_API_KEY` | LLM assist (RAG phrasing, rule drafts) — does **not** set risk scores |
| `TRACE24_ADMIN_TOKEN` | Required for Admin **write** APIs on Vercel; paste same value in Admin UI |
| `TRACE24_DEMO_PASSWORD` | Shared demo login password (enables `/login` gate) |
| `TRACE24_EMAIL_ALLOWLIST` | Comma-separated emails allowed to enter (optional; with or without password) |
| `TRACE24_GATE_SECRET` | Optional cookie signing secret |
| `OPEND_API_KEY` | Optional Open D enrich |

**Access layers**
1. **Demo gate** — if password and/or email allowlist is set, visitors must pass `/login` before any page/API
2. **Admin token** — mutating Admin APIs still require `TRACE24_ADMIN_TOKEN` in the Admin UI

On Vercel production, Admin mutating routes deny writes until `TRACE24_ADMIN_TOKEN` is set.

## Data notes

- **Contracts:** prefer `data/contracts-cache/*.json.gz` — cloud IPs often get HTTP 403 from data.go.th
- **Websites:** `data/catalog/agency-websites.json` (DLA Open Data + curated); not every municipality has a host
- **ราคากลางราชการ:** out of scope for MVP — Prices UI uses contract market medians
- **R13 surname / R26 concealment:** investigation leads / presumptions — not accusations
- Curated demo snapshots remain under `data/real/` for a few agencies; catalog `egp-*` ids use live reports

## Useful scripts

```bash
npm run import-dla-websites   # refresh municipal website map from DLA CSV
npm run discover-websites    # optional Bing/host probe (do not overwrite DLA hosts carelessly)
npm run sync-contracts-cache # rebuild caches from a Thailand-reachable network
```

## Design

UI ported from the TRACE24 prototype (Chakra Petch, `#FBFBF9` / `#111110` / `#8A5A1C`).
