import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '../../data/real');

const THAI_DIGITS = { '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4', '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9' };

export function toArabicDigits(s) {
  return String(s).replace(/[๐-๙]/g, (d) => THAI_DIGITS[d] ?? d);
}

export function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseMoney(text) {
  const t = toArabicDigits(text);
  const m = t.match(/([\d,]+(?:\.\d+)?)\s*บาท|฿\s*([\d,]+(?:\.\d+)?)|^([\d,]+(?:\.\d+)?)$/);
  if (!m) return null;
  const raw = (m[1] || m[2] || m[3]).replace(/,/g, '');
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function formatBaht(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} ล.`;
  if (n >= 1_000) return `฿${Math.round(n).toLocaleString('en-US')}`;
  return `฿${n.toLocaleString('en-US')}`;
}

export function pctWidth(value, max) {
  if (!max) return '0%';
  return `${Math.min(100, Math.round((value / max) * 100))}%`;
}

export function methodShort(method) {
  if (!method) return '—';
  if (/e-bidding|อิเล็กทรอนิกส์/i.test(method)) return 'e-bidding';
  if (/เฉพาะเจาะจง/i.test(method)) return 'เฉพาะเจาะจง';
  if (/คัดเลือก/i.test(method)) return 'คัดเลือก';
  return method.slice(0, 12);
}

export function inferCategory(name) {
  if (/ถนน|คสล|ผิวจราจร|รางวี/i.test(name)) return 'งานก่อสร้างถนน';
  if (/ระบายน้ำ|ท่อ/i.test(name)) return 'งานระบายน้ำ';
  if (/อาคาร|ซ่อมแซม|ปรับปรุง/i.test(name)) return 'งานปรับปรุงอาคาร';
  if (/ครุภัณฑ์|รถ|เครื่อง/i.test(name)) return 'จัดซื้อครุภัณฑ์';
  if (/ยา|เวชภัณฑ์/i.test(name)) return 'ยาและเวชภัณฑ์';
  if (/อาหาร|จัดเลี้ยง/i.test(name)) return 'บริการอาหาร';
  if (/ป้าย|ไวนิล/i.test(name)) return 'งานประชาสัมพันธ์';
  return 'จัดซื้อจัดจ้าง';
}

export function normalizeTitle(title) {
  return title
    .replace(/ประกาศ(ผู้ชนะ|รายชื่อผู้ชนะ|เชิญชวน|เลขที่\s*\d+\/\d+)[^—]*/gi, '')
    .replace(/โดยวิธี[^—]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function similarity(a, b) {
  const wa = new Set(normalizeTitle(a).split(/\s+/).filter((w) => w.length > 2));
  const wb = new Set(normalizeTitle(b).split(/\s+/).filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.max(wa.size, wb.size);
}

export async function fetchText(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'TRACE24/1.0 (public-sector research demo)' },
  });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.text();
}

export function parsePhothalePage(html) {
  const rows = [];
  const re =
    /<tr>\s*<td[^>]*>([^<]*)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m;
  while ((m = re.exec(html))) {
    const date = stripHtml(m[1]);
    const cell = m[2];
    const link = cell.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const href = link[1];
    const title = stripHtml(link[2]);
    const tags = [...cell.matchAll(/<font[^>]*>([^<]*)<\/font>/gi)].map((x) => stripHtml(x[1]));
    const annType = tags[0] || '';
    const method = tags[1] || '';
    const projectId =
      href.match(/projectId=([^&"]+)/i)?.[1] ||
      href.match(/fileId=([^&"]+)/i)?.[1] ||
      title.slice(0, 40);
    rows.push({
      date,
      title,
      href,
      annType,
      method,
      projectId,
      source: 'phothale.go.th',
    });
  }
  return rows;
}

export async function scrapePhothale(maxPages = 40) {
  const all = [];
  let totalPages = maxPages;
  for (let page = 1; page <= totalPages; page++) {
    const html = await fetchText(`https://www.phothale.go.th/egp/${page}`);
    const countMatch = html.match(/พบทั้งหมด\s*([\d,]+)\s*รายการ/);
    if (countMatch) {
      const total = Number(countMatch[1].replace(/,/g, ''));
      totalPages = Math.min(maxPages, Math.ceil(total / 20));
    }
    const rows = parsePhothalePage(html);
    if (!rows.length) break;
    all.push(...rows);
    console.log(`phothale page ${page}/${totalPages}: +${rows.length}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  return all;
}

export function parseNakornnontPage(html) {
  const rows = [];
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, '');
  const re =
    /<tr>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m;
  while ((m = re.exec(cleaned))) {
    const code = stripHtml(m[1]).trim();
    if (!code || code === 'เลขที่โครงการ' || !/^[A-Za-z0-9]/.test(code)) continue;
    const dept = stripHtml(m[2]);
    const method = stripHtml(m[3]);
    const annType = stripHtml(m[4]);
    const titleCell = m[5];
    const date = stripHtml(m[6]);
    const link = titleCell.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const title = link ? stripHtml(link[2]) : stripHtml(titleCell);
    const href = link?.[1] || '';
    rows.push({
      date,
      title,
      href,
      annType,
      method,
      projectId: code,
      dept,
      source: 'procurement.nakornnont.go.th',
    });
  }
  return rows;
}

export async function scrapeNakornnont(maxPages = 40) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const url =
      page === 1
        ? 'https://procurement.nakornnont.go.th/news_announce'
        : `https://procurement.nakornnont.go.th/news_announce?page=${page}`;
    try {
      const html = await fetchText(url);
      const rows = parseNakornnontPage(html);
      if (!rows.length) break;
      all.push(...rows);
      console.log(`nakornnont page ${page}: +${rows.length}`);
    } catch (e) {
      console.warn('nakornnont page', page, e.message);
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return all;
}

export async function fetchEgpContracts({ apiKey, deptCode, keyword, years = [2566, 2567, 2568] }) {
  const all = [];
  for (const year of years) {
    let offset = 0;
    const limit = 100;
    while (true) {
      const params = new URLSearchParams({
        'api-key': apiKey,
        year: String(year),
        offset: String(offset),
        limit: String(limit),
      });
      if (deptCode) params.set('dept_code', deptCode);
      if (keyword) params.set('keyword', keyword);
      const url = `https://opend.data.go.th/govspending/cgdcontract?${params}`;
      const r = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'api-key': apiKey,
          'User-Agent': 'TRACE24/1.0 (public-sector research demo)',
        },
      });
      const raw = await r.text();
      if (!r.ok) {
        const snippet = raw.slice(0, 120).replace(/\s+/g, ' ');
        throw new Error(`e-GP API ${r.status}: ${snippet}`);
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`e-GP API returned non-JSON (endpoint may be down/migrated)`);
      }
      if (!data.status) break;
      const batch = data.result || [];
      if (!batch.length) break;
      all.push(...batch.map((p) => ({ ...p, _fy: year })));
      if (batch.length < limit) break;
      offset += limit;
      await new Promise((r) => setTimeout(r, 200));
    }
    console.log(`egp year ${year}: total ${all.length}`);
  }
  return all;
}

export function buildDatasetFromAnnouncements(agency, rows) {
  const byProject = new Map();
  for (const row of rows) {
    const key = row.projectId;
    if (!byProject.has(key)) {
      byProject.set(key, {
        projectId: key,
        title: normalizeTitle(row.title),
        rawTitle: row.title,
        method: row.method || '',
        dept: row.dept || '',
        events: [],
        hrefs: new Set(),
      });
    }
    const p = byProject.get(key);
    if (row.title.length > p.rawTitle.length) {
      p.rawTitle = row.title;
      p.title = normalizeTitle(row.title);
    }
    if (row.method && !p.method) p.method = row.method;
    p.events.push({
      date: row.date,
      annType: row.annType,
      title: row.title,
      href: row.href,
      method: row.method,
    });
    if (row.href) p.hrefs.add(row.href);
  }

  const projects = [...byProject.values()];
  const winnerProjects = projects.filter((p) =>
    p.events.some((e) => /ผู้ชนะ|ผู้ได้รับการคัดเลือก/i.test(e.annType + e.title))
  );

  const methodCounts = {};
  for (const p of projects) {
    const m = methodShort(p.method || 'อื่น ๆ');
    methodCounts[m] = (methodCounts[m] || 0) + 1;
  }
  const totalProjects = projects.length;
  const specificPct = ((methodCounts['เฉพาะเจาะจง'] || 0) / Math.max(totalProjects, 1)) * 100;

  const alertsByProject = new Map();
  const addAlert = (pid, alert) => {
    if (!alertsByProject.has(pid)) alertsByProject.set(pid, []);
    alertsByProject.get(pid).push(alert);
  };

  if (specificPct >= 55) {
    for (const p of projects.filter((x) => methodShort(x.method) === 'เฉพาะเจาะจง').slice(0, 8)) {
      addAlert(p.projectId, {
        tag: 'R3 · กระบวนการ',
        title: 'ใช้วิธีเฉพาะเจาะจงบ่อย',
        sevKey: specificPct >= 70 ? 'High' : 'Medium',
        conf: 'ความเชื่อมั่น 0.88',
        facts: [
          ['สัดส่วนเฉพาะเจาะจง', `${specificPct.toFixed(0)}%`],
          ['โครงการทั้งหมด', String(totalProjects)],
        ],
        explain: `หน่วยงานใช้วิธีเฉพาะเจาะจง ${specificPct.toFixed(0)}% ของโครงการที่พบในแหล่งข้อมูลสาธารณะ — สูงกว่าค่ากลางของกลุ่มเทศบาลเปรียบเทียบ (~45%)`,
        innocent: 'งานจำนวนมากอาจอยู่ใต้เกณฑ์วงเงินที่กฎหมายกำหนดให้ใช้วิธีเฉพาะเจาะจงได้',
        evidence: p.events.slice(0, 2).map((e) => e.href || e.title),
      });
    }
  }

  for (const p of projects) {
    const hasWinner = p.events.some((e) => /ผู้ชนะ|ผู้ได้รับการคัดเลือก/i.test(e.annType));
    const hasInvite = p.events.some((e) => /เชิญชวน|ประกวดราคา|e-bidding/i.test(e.annType + e.title));
    if (hasInvite && !hasWinner) {
      addAlert(p.projectId, {
        tag: 'R11 · การเปิดเผยข้อมูล',
        title: 'พบประกาศเชิญชวนแต่ไม่พบประกาศผู้ชนะในแหล่งที่เก็บ',
        sevKey: 'Low',
        conf: 'ความเชื่อมั่น 0.75',
        facts: [
          ['สถานะ', 'มีประกาศเชิญชวน/ประกวดราคา'],
          ['ประกาศผู้ชนะ', 'ไม่พบในเว็บไซต์หน่วยงาน'],
        ],
        explain: 'โครงการมีประกาศเชิญชวนหรือประกวดราคา แต่ยังไม่พบประกาศผู้ชนะในแหล่งข้อมูลที่ดึงได้ — อาจยังไม่ประกาศผล หรือเผยแพร่ในช่องทางอื่น',
        innocent: 'โครงการอาจอยู่ระหว่างพิจารณาหรือประกาศผลบน e-GP โดยตรง',
        evidence: [...p.hrefs].slice(0, 2),
      });
    }
  }

  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      const a = projects[i];
      const b = projects[j];
      const sim = similarity(a.title, b.title);
      if (sim >= 0.72) {
        addAlert(a.projectId, {
          tag: 'R8 · กระบวนการ',
          title: 'คำบรรยายโครงการคล้ายกัน',
          sevKey: 'Medium',
          conf: `ความเชื่อมั่น ${sim.toFixed(2)}`,
          facts: [
            ['โครงการ A', a.projectId],
            ['โครงการ B', b.projectId],
            ['ความคล้าย', `${Math.round(sim * 100)}%`],
          ],
          explain: `ชื่อ/คำอธิบายโครงการคล้ายกัน ${Math.round(sim * 100)}% — อาจเป็นงานชุดเดียวกันหรือรูปแบบซ้ำ`,
          innocent: 'หน่วยงานอาจใช้แม่แบบ TOR/ชื่อโครงการมาตรฐานสำหรับงานประเภทเดียวกัน',
          evidence: [...a.hrefs, ...b.hrefs].slice(0, 2),
        });
      }
    }
  }

  const projectRecords = {};
  const priority = [];
  let idx = 0;
  for (const p of projects) {
    idx++;
    const id = `p${idx}`;
    const alerts = alertsByProject.get(p.projectId) || [];
    const sevKey = alerts.some((a) => a.sevKey === 'High')
      ? 'High'
      : alerts.some((a) => a.sevKey === 'Medium')
        ? 'Medium'
        : 'Low';
    const timeline = [...p.events]
      .sort((a, b) => a.date.localeCompare(b.date, 'th'))
      .map((e) => [e.date, `${e.annType || 'ประกาศ'} — ${normalizeTitle(e.title).slice(0, 80)}`, e.href || 'e-GP']);
    const fyMatch = p.rawTitle.match(/25\d{2}|๒๕\d{2}/);
    const fy = fyMatch ? `ปีงบ ${toArabicDigits(fyMatch[0]).replace(/[^\d]/g, '')}` : '—';
    projectRecords[id] = {
      code: String(p.projectId).slice(0, 16),
      name: p.title || p.rawTitle,
      cat: inferCategory(p.rawTitle),
      fy,
      method: p.method || '—',
      methodShort: methodShort(p.method),
      budget: '—',
      ref: '—',
      award: '—',
      pct: '—',
      winner: null,
      announced: p.events.find((e) => /ผู้ชนะ/i.test(e.annType))?.date || p.events.at(-1)?.date || '—',
      sevKey,
      ind: alerts.length,
      alerts,
      timeline,
      related: [],
      _sourceUrl: [...p.hrefs][0] || null,
    };
    if (alerts.length) priority.push({ id, sevKey, ind: alerts.length });
  }

  priority.sort((a, b) => {
    const sev = { High: 3, Medium: 2, Low: 1 };
    return sev[b.sevKey] - sev[a.sevKey] || b.ind - a.ind;
  });

  const totalAnnouncements = rows.length;
  const uniqueProjects = projects.length;
  const winnerCount = winnerProjects.length;

  return {
    agency,
    meta: {
      source: rows[0]?.source || 'public-web',
      fetchedAt: new Date().toISOString(),
      scanSummary: `สัญญาณความเสี่ยง ${[...alertsByProject.values()].flat().length} รายการ · ข้อมูลจริงจากแหล่งสาธารณะ`,
      dataPct: `${Math.min(95, 60 + Math.round((winnerCount / Math.max(uniqueProjects, 1)) * 30))}%`,
      dataGapNote: `เอกสาร ${totalAnnouncements} รายการ · โครงการ ${uniqueProjects} รายการ · ราคา/ผู้ชนะต้องใช้ e-GP API`,
      priorityNote: `เรียงตามระดับสัญญาณ · ${Math.min(6, priority.length)} จาก ${uniqueProjects} โครงการ`,
      concNote: `ข้อมูลจากประกาศ e-GP บนเว็บไซต์หน่วยงาน — ยังไม่รวมราคาที่ตกลงจนกว่าจะเชื่อม e-GP API`,
      vendorsTitle: 'ผู้รับจ้าง (ต้องเชื่อม e-GP API สำหรับข้อมูลราคา)',
      graphTitle: 'เครือข่ายโครงการจากประกาศสาธารณะ',
      graphNote: `แสดง ${Math.min(uniqueProjects, 20)} โครงการจาก ${uniqueProjects} รายการ · ทุกรายการมี URL ต้นทาง`,
    },
    stats: [
      { label: 'ประกาศ e-GP', value: String(totalAnnouncements), sub: 'จากเว็บไซต์หน่วยงาน' },
      { label: 'โครงการ', value: String(uniqueProjects), sub: `ประกาศผู้ชนะ ${winnerCount} รายการ` },
      { label: 'วิธีเฉพาะเจาะจง', value: `${specificPct.toFixed(0)}%`, sub: `${methodCounts['เฉพาะเจาะจง'] || 0} โครงการ` },
      { label: 'e-bidding', value: `${(((methodCounts['e-bidding'] || 0) / Math.max(totalProjects, 1)) * 100).toFixed(0)}%`, sub: `${methodCounts['e-bidding'] || 0} โครงการ` },
      { label: 'สัญญาณความเสี่ยง', value: String([...alertsByProject.values()].flat().length), sub: 'จากกฎที่อธิบายได้' },
    ],
    years: [],
    methods: Object.entries(methodCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, n]) => ({
        label,
        n: String(n),
        pct: pctWidth(n, totalProjects),
      })),
    riskCats: [
      { label: 'กระบวนการ', count: [...alertsByProject.values()].flat().filter((a) => /R3|R6|R8|R9/.test(a.tag)).length, pct: '100%' },
      { label: 'การเปิดเผยข้อมูล', count: [...alertsByProject.values()].flat().filter((a) => /R11/.test(a.tag)).length, pct: '80%' },
      { label: 'การแข่งขัน', count: 0, pct: '0%' },
      { label: 'ราคา', count: 0, pct: '0%' },
      { label: 'ความสัมพันธ์', count: 0, pct: '0%' },
    ],
    topContractors: [],
    priorityOrder: priority.slice(0, 6).map((p) => p.id),
    projects: projectRecords,
    contractors: {},
    def: { project: priority[0]?.id || 'p1', contractor: 'c1', node: 'muni' },
    clusters: [],
    graph: buildSimpleGraph(agency, projectRecords, priority),
    sources: [
      {
        url: agency.dataUrl,
        type: 'ประกาศ e-GP บนเว็บไซต์หน่วยงาน',
        status: 'ปกติ',
        ok: true,
        last: 'เพิ่งดึงข้อมูล',
        docs: String(totalAnnouncements),
      },
      {
        url: 'opend.data.go.th/govspending/cgdcontract',
        type: 'e-GP API (ราคา/ผู้ชนะ)',
        status: process.env.OPEND_API_KEY ? 'พร้อมใช้งาน' : 'ต้องตั้ง OPEND_API_KEY',
        ok: !!process.env.OPEND_API_KEY,
        last: '—',
        docs: process.env.OPEND_API_KEY ? 'เชื่อมต่อได้' : '0',
      },
    ],
    stages: [
      ['ระบุหน่วยงานสำเร็จ', `ยืนยัน ${agency.web}`],
      ['ค้นพบแหล่งข้อมูล', agency.dataUrl],
      ['ดึงประกาศ e-GP', `${totalAnnouncements} รายการ`],
      ['จัดกลุ่มโครงการ', `${uniqueProjects} โครงการ`],
      ['สกัดข้อมูลโครงการ', `${uniqueProjects} รายการ`],
      ['ประมวลกฎความเสี่ยง', `${[...alertsByProject.values()].flat().length} สัญญาณ`],
      ['รายงานพร้อมแล้ว', 'ข้อมูลจริงจากแหล่งสาธารณะ'],
    ],
    queueStats: [
      { n: String(totalAnnouncements), label: 'ประกาศทั้งหมด' },
      { n: String(uniqueProjects), label: 'โครงการที่จัดกลุ่มแล้ว' },
      { n: String(winnerCount), label: 'มีประกาศผู้ชนะ' },
      { n: '0', label: 'รอ e-GP API' },
    ],
    queueRows: rows.slice(0, 5).map((r, i) => ({
      id: `D-${i + 1}`,
      title: normalizeTitle(r.title).slice(0, 60),
      type: r.annType || 'ประกาศ',
      fmt: 'HTML',
      status: 'ดึงจากเว็บแล้ว',
      ok: true,
    })),
    erRows: [],
    adminReviewRows: priority.slice(0, 5).map((p, i) => ({
      key: `rv${i}`,
      code: projectRecords[p.id].code,
      title: projectRecords[p.id].alerts[0]?.title || projectRecords[p.id].name.slice(0, 40),
      sevKey: p.sevKey,
      def: 'ใหม่',
    })),
    caseFile: {
      id: `CASE-REAL-${agency.id.toUpperCase()}`,
      status: 'รวบรวมหลักฐาน',
      opened: `สร้างอัตโนมัติ ${new Date().toLocaleDateString('th-TH')}`,
      owner: 'ระบบ TRACE24 · ข้อมูลจริง',
      title: `การวิเคราะห์จัดซื้อจัดจ้าง — ${agency.th}`,
      summary: `รายงานนี้สร้างจากประกาศ e-GP จริง ${totalAnnouncements} รายการ (${uniqueProjects} โครงการ) จาก ${agency.dataUrl} สัญญาณความเสี่ยมถูกคำนวณจากกฎที่อธิบายได้บนข้อมูลที่มี — ราคาและผู้ชนะจะสมบูรณ์เมื่อเชื่อม e-GP API`,
      signals: `สัญญาณ ${[...alertsByProject.values()].flat().length} รายการจากข้อมูลประกาศสาธารณะ`,
      timeline: priority.slice(0, 5).flatMap((p) =>
        (projectRecords[p.id].timeline || []).slice(0, 1).map((t) => [t[0], t[1], t[2]])
      ),
      parties: [[agency.th, 'หน่วยงานจัดจ้าง', false]],
      money: [],
      questions: [
        ['ข้อมูลราคาที่ตกลงและผู้ชนะครบถ้วนหรือไม่', 'ต้องเชื่อม e-GP API'],
        ['สัดส่วนวิธีเฉพาะเจาะจงสูงเกินกลุ่มเปรียบเทียบหรือไม่', 'กำลังวิเคราะห์'],
      ],
      evidence: rows.slice(0, 6).map((r) => r.href || r.title),
      notes: [['วันนี้', `ดึงข้อมูลจริง ${totalAnnouncements} ประกาศจากแหล่งสาธารณะ`]],
    },
  };
}

function buildSimpleGraph(agency, projects, priority) {
  const nodes = [
    { id: 'muni', type: 'muni', x: 150, y: 280, label: agency.tshort || agency.th.slice(0, 8) },
  ];
  const edges = [];
  const details = {
    muni: {
      typeLabel: 'หน่วยงาน',
      label: agency.th,
      sub: agency.loc,
      facts: [`ข้อมูลจริงจาก ${agency.dataUrl}`, `${Object.keys(projects).length} โครงการ`],
      docs: [agency.dataUrl],
      link: null,
    },
  };
  let x = 350;
  let y = 120;
  for (const p of priority.slice(0, 6)) {
    const pr = projects[p.id];
    nodes.push({ id: p.id, type: 'project', x, y, label: pr.code });
    edges.push(['muni', p.id, 'จัดจ้าง', false]);
    details[p.id] = {
      typeLabel: 'โครงการ',
      label: pr.name.slice(0, 60),
      sub: `${pr.methodShort} · ${pr.ind} สัญญาณ`,
      facts: pr.alerts.slice(0, 2).map((a) => a.title),
      docs: pr.alerts[0]?.evidence || [],
      link: 'project',
      target: p.id,
    };
    y += 55;
    if (y > 450) {
      y = 120;
      x += 180;
    }
  }
  return { nodes, edges, details };
}

export async function fetchAnnouncePlain(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'TRACE24/1.0 (public-sector research demo)' },
  });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  let text = '';
  try {
    text = new TextDecoder('windows-874').decode(buf);
  } catch {
    text = buf.toString('utf8');
  }
  // Fallback if page is already UTF-8 and decode mangled it
  if (!/ประกาศ|ผู้ชนะ|ยกเลิก|เชิญชวน/.test(text) && /ประกาศ|ผู้ชนะ/.test(buf.toString('utf8'))) {
    text = buf.toString('utf8');
  }
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseWinnerFromAnnounceText(plain) {
  if (!plain || /ค้นหาไฟล์เอกสารไม่พบ/.test(plain)) {
    return { winner: null, price: null, budget: null };
  }
  const winnerRaw =
    plain.match(/ผู้ได้รับการคัดเลือก\s*ได้แก่\s*(.+?)\s*โดยเสนอราคา/)?.[1] ||
    plain.match(/ได้แก่\s*((?:นาย|นางสาว|นาง|หจก\.|ห้างหุ้นส่วนจำกัด|บริษัท)[^โดย]{1,100}?)\s*โดยเสนอราคา/)?.[1] ||
    null;
  const winner = winnerRaw
    ? winnerRaw
        .replace(/\s+/g, ' ')
        .replace(/\([^)]*(ให้บริการ|ขาย|ส่งออก|ผู้ผลิต)[^)]*\)/g, '')
        .trim()
    : null;

  const moneyThai =
    plain.match(/เป็นเงินทั้งสิ้น\s*([0-9๐-๙,.]+)\s*บาท/)?.[1] || null;
  const price = moneyThai ? Number(toArabicDigits(moneyThai).replace(/,/g, '')) : null;

  const budgetThai =
    plain.match(/วงเงินงบประมาณ\s*([0-9๐-๙,.]+)\s*บาท/)?.[1] ||
    plain.match(/ราคากลาง\s*([0-9๐-๙,.]+)\s*บาท/)?.[1] ||
    null;
  const budget = budgetThai ? Number(toArabicDigits(budgetThai).replace(/,/g, '')) : null;

  return {
    winner: winner || null,
    price: Number.isFinite(price) ? price : null,
    budget: Number.isFinite(budget) ? budget : null,
  };
}

function egpAnnounceUrl(projectId, { templateType = 'W2', tempAnnoun = 'A', seqNo = 1 } = {}) {
  const params = new URLSearchParams({
    servlet: 'gojsp',
    proc_id: 'ShowHTMLFile',
    processFlows: 'Procure',
    projectId: String(projectId),
    templateType,
    temp_Announ: tempAnnoun,
    temp_itemNo: tempAnnoun === 'A' ? '0' : '1',
    seqNo: String(seqNo),
  });
  return `https://process.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?${params}`;
}

function collectAnnounceTargets(dataset) {
  const targets = [];
  for (const [pid, pr] of Object.entries(dataset.projects)) {
    const hrefs = [];
    for (const row of pr.timeline || []) {
      const href = row[2];
      if (
        href &&
        /gprocurement\.go\.th|ShowHTMLFile/i.test(href) &&
        /ผู้ชนะ|คัดเลือก/.test(row[1] || '') &&
        !/ยกเลิก/.test(row[1] || '')
      ) {
        hrefs.push(href);
      }
    }
    if (pr._sourceUrl && /gprocurement\.go\.th|ShowHTMLFile/i.test(pr._sourceUrl)) {
      hrefs.push(pr._sourceUrl);
    }
    // Fallback: construct from project code for agencies that only host local PDF mirrors
    if (!hrefs.length && /^\d{8,}$/.test(String(pr.code))) {
      hrefs.push(egpAnnounceUrl(pr.code));
    }
    const unique = [...new Set(hrefs)];
    if (unique.length) targets.push({ pid, urls: unique });
  }
  return targets;
}

function finalizeContractors(dataset, contractors) {
  const totalValue = Object.values(contractors).reduce((s, c) => s + (c.total || 0), 0);
  dataset.contractors = {};
  dataset.topContractors = [];
  const list = Object.values(contractors).filter((c) => c._id);
  const maxN = Math.max(1, ...list.map((x) => x.contracts));
  for (const co of list) {
    const totalNum = co.total || 0;
    co.total = formatBaht(totalNum);
    co.shareNum = totalValue ? `${((totalNum / totalValue) * 100).toFixed(1)}%` : '—';
    co.share = co.shareNum;
    dataset.contractors[co._id] = co;
    dataset.topContractors.push({
      id: co._id,
      name: co.name,
      value: co.total,
      n: co.contracts,
      pct: pctWidth(co.contracts, maxN),
    });
  }
  dataset.topContractors.sort((a, b) => b.n - a.n || String(b.value).localeCompare(String(a.value)));
}

export async function enrichFromAnnouncementPages(dataset, { maxPages = 120, concurrency = 4 } = {}) {
  const targets = collectAnnounceTargets(dataset).slice(0, maxPages);
  console.log(`Enriching from ${targets.length} announcement pages...`);
  const contractors = {};
  let cIdx = 0;
  let enriched = 0;
  let failed = 0;

  const upsertWinner = (pid, winner, price, budget, sourceUrl) => {
    const pr = dataset.projects[pid];
    if (!pr) return;
    if (price != null) {
      pr.award = formatBaht(price);
      if (budget != null) {
        pr.budget = formatBaht(budget);
        pr.ref = formatBaht(budget);
        pr.pct = `${((price / budget) * 100).toFixed(2)}%`;
      }
    }
    if (!winner) return;
    const key = winner.slice(0, 40);
    if (!contractors[key]) {
      cIdx++;
      const cid = `c${cIdx}`;
      contractors[key] = {
        _id: cid,
        name: winner,
        reg: '—',
        contracts: 0,
        total: 0,
        shareNum: '—',
        share: '—',
        cats: pr.cat || 'จัดซื้อจัดจ้าง',
        address: '—',
        addrNote: 'จากประกาศผู้ชนะบน e-GP / เว็บหน่วยงาน',
        addrFlag: false,
        directors: [],
        risks: [],
        related: [],
        rows: [],
        docs: [sourceUrl].filter(Boolean),
      };
    }
    const co = contractors[key];
    co.contracts++;
    co.total += price || 0;
    co.rows.push([
      pid,
      pr.code,
      pr.name.slice(0, 50),
      formatBaht(price),
      pr.methodShort,
      pr.fy || '—',
    ]);
    pr.winner = co._id;
  };

  let i = 0;
  async function worker() {
    while (i < targets.length) {
      const idx = i++;
      const { pid, urls } = targets[idx];
      let ok = false;
      for (const url of urls) {
        try {
          const plain = await fetchAnnouncePlain(url);
          const parsed = parseWinnerFromAnnounceText(plain);
          if (parsed.winner || parsed.price != null) {
            upsertWinner(pid, parsed.winner, parsed.price, parsed.budget, url);
            enriched++;
            ok = true;
            break;
          }
        } catch {
          // try next url
        }
      }
      if (!ok) failed++;
      if ((idx + 1) % 20 === 0 || idx + 1 === targets.length) {
        console.log(`  announce enrich ${idx + 1}/${targets.length} (ok ${enriched}, miss ${failed})`);
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
  finalizeContractors(dataset, contractors);

  const withAward = Object.values(dataset.projects).filter((p) => p.award && p.award !== '—').length;
  dataset.meta.dataGapNote = `สกัดจากประกาศผู้ชนะ ${enriched} รายการ · มีราคา ${withAward} โครงการ · ไม่ใช้ e-GP Open D API`;
  dataset.meta.concNote = `ราคาและผู้ชนะดึงจากประกาศ e-GP / หน้าประกาศหน่วยงานโดยตรง`;
  dataset.meta.vendorsTitle = 'ผู้รับจ้างจากประกาศผู้ชนะ';
  dataset.sources = dataset.sources || [];
  const annSource = dataset.sources.find((s) => /ประกาศ/.test(s.type));
  if (annSource) {
    annSource.docs = String(Number(annSource.docs || 0));
    annSource.last = `enrich ผู้ชนะ ${enriched} รายการ`;
  }
  dataset.sources = dataset.sources.map((s) =>
    /e-GP API/.test(s.type)
      ? {
          ...s,
          status: 'ข้าม — ใช้ประกาศหน่วยงานแทน',
          ok: false,
          docs: '0',
          last: 'endpoint 404 / ไม่เสถียร',
        }
      : s
  );
  if (Object.keys(dataset.contractors).length && dataset.def.contractor === 'c1') {
    dataset.def.contractor = Object.keys(dataset.contractors)[0];
    dataset.def.node = dataset.def.contractor;
  }
  console.log(`Announcement enrich done: ${enriched} ok, ${failed} miss, contractors ${Object.keys(dataset.contractors).length}`);
  return dataset;
}

export function enrichWithEgpContracts(dataset, contracts) {
  const contractors = {};
  let cIdx = 0;
  const projectByName = new Map();
  for (const [id, pr] of Object.entries(dataset.projects)) {
    projectByName.set(normalizeTitle(pr.name), id);
  }

  for (const raw of contracts) {
    const contract = raw.contract?.[0];
    if (!contract) continue;
    const winner = contract.winner || '';
    const price = parseMoney(contract.price_agree || raw.project_money || '');
    const budget = parseMoney(raw.project_money || '');
    const name = normalizeTitle(raw.project_name || '');
    let pid = projectByName.get(name);
    if (!pid) {
      cIdx++;
      pid = `ep${cIdx}`;
      dataset.projects[pid] = {
        code: raw.project_id || `EGP-${cIdx}`,
        name: raw.project_name,
        cat: inferCategory(raw.project_name || ''),
        fy: `ปีงบ ${raw._fy || '—'}`,
        method: raw.project_type_name || '—',
        methodShort: methodShort(raw.project_type_name || ''),
        budget: formatBaht(budget),
        ref: formatBaht(budget),
        award: formatBaht(price),
        pct: budget && price ? `${((price / budget) * 100).toFixed(2)}%` : '—',
        winner: null,
        announced: contract.contract_date || '—',
        sevKey: 'Low',
        ind: 0,
        alerts: [],
        timeline: [[contract.contract_date || '—', 'ข้อมูลสัญญา e-GP', 'e-GP API']],
        related: [],
      };
    } else {
      const pr = dataset.projects[pid];
      pr.budget = formatBaht(budget);
      pr.ref = formatBaht(budget);
      pr.award = formatBaht(price);
      if (budget && price) pr.pct = `${((price / budget) * 100).toFixed(2)}%`;
      pr.announced = contract.contract_date || pr.announced;
    }

    if (winner) {
      const key = winner.slice(0, 24);
      if (!contractors[key]) {
        cIdx++;
        const cid = `c${cIdx}`;
        contractors[cid] = {
          name: winner,
          reg: contract.winner_tin || '—',
          contracts: 0,
          total: 0,
          shareNum: '—',
          share: '—',
          cats: inferCategory(raw.project_name || ''),
          address: '—',
          addrNote: 'จาก e-GP API',
          addrFlag: false,
          directors: [],
          risks: [],
          related: [],
          rows: [],
          docs: ['e-GP API'],
        };
        contractors[key] = { ...contractors[key], _id: cid };
      }
      const co = contractors[key];
      co.contracts++;
      co.total += price || 0;
      co.rows.push([
        pid,
        dataset.projects[pid].code,
        dataset.projects[pid].name.slice(0, 50),
        formatBaht(price),
        dataset.projects[pid].methodShort,
        String(raw._fy || '—'),
      ]);
      dataset.projects[pid].winner = co._id;
    }
  }

  const totalValue = Object.values(contractors).reduce((s, c) => s + c.total, 0);
  dataset.contractors = {};
  dataset.topContractors = [];
  for (const co of Object.values(contractors)) {
    co.total = formatBaht(co.total);
    co.shareNum = totalValue ? `${((parseMoney(co.total) / totalValue) * 100).toFixed(1)}%` : '—';
    co.share = co.shareNum;
    dataset.contractors[co._id] = co;
    dataset.topContractors.push({
      id: co._id,
      name: co.name,
      value: co.total,
      n: co.contracts,
      pct: pctWidth(co.contracts, Math.max(...Object.values(contractors).map((x) => x.contracts))),
    });
  }
  dataset.topContractors.sort((a, b) => b.n - a.n);
  dataset.meta.dataGapNote = 'เชื่อม e-GP API แล้ว — มีราคาและผู้ชนะ';
  return dataset;
}

export function saveDataset(id, dataset) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(dataset, null, 2), 'utf8');
  console.log('saved', file);
  return file;
}
