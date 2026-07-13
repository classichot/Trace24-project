# TRACE24

Public-sector investigation intelligence platform — frontend prototype matching the design reference.

## Run locally

```bash
cd trace24-app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Design reference

UI is ported from `../design-reference/TRACE24 Prototype.dc.html` (AI Municipal Spending Integrity Platform.zip).

- **Font:** Chakra Petch (Thai + Latin)
- **Palette:** `#FBFBF9` background, `#111110` text, `#8A5A1C` accent
- **Layout:** 1160px max-width, inline styles matching the prototype

## Screens

| Screen | Description |
|--------|-------------|
| Home | Search municipalities / agencies |
| Scan | Public data ingestion progress |
| Dashboard | Agency report with stats and priority projects |
| Project | Project investigation with risk signals |
| Contractor | Company profile and contracts |
| Graph | Relationship graph (country / cluster / entity layers) |
| Admin | Internal tools (crawl, queue, entity resolution, review, case) |
| Info | Methodology, sources, corrections, about |

## Demo flow

1. Search **เทศบาลตำบลป่าไผ่** (or **โรงพยาบาลดอยสะเก็ด**)
2. Click **วิเคราะห์หน่วยงานนี้**
3. Wait for scan to complete → **ดูรายงานหน่วยงาน**
4. Explore dashboard, projects, contractors, graph, and admin case workspace

All agency, company, and document data is fictional demo data from the prototype.
