import type { AuditObservationPack } from './observation-pack';

function esc(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Printable สตง-style money observation workpaper. */
export function buildAuditObservationHtml(pack: AuditObservationPack): string {
  const bySec = Object.entries(pack.summary.bySection)
    .map(([k, v]) => `<li>${esc(k)} — ${v} ประเด็น</li>`)
    .join('');

  const winners =
    pack.topWinners.length > 0
      ? pack.topWinners
          .map(
            (w) =>
              `<tr><td>${esc(w.name)}</td><td>${esc(w.total)}</td><td>${esc(w.shareHint || '—')}</td></tr>`
          )
          .join('')
      : '<tr><td colspan="3">ไม่มีข้อมูลผู้ชนะในแคช</td></tr>';

  const grouped = new Map<string, typeof pack.observations>();
  for (const o of pack.observations) {
    const list = grouped.get(o.section) || [];
    list.push(o);
    grouped.set(o.section, list);
  }

  const sections = [...grouped.entries()]
    .map(([sec, rows]) => {
      const body = rows
        .map(
          (o) => `<tr>
  <td>${esc(o.ruleTag)}<br/><span class="muted">${esc(o.severity)}</span></td>
  <td><strong>${esc(o.projectName)}</strong><br/><span class="muted">${esc(o.projectId)} · ปีงบ ${esc(o.fy)}</span></td>
  <td>${esc(o.winner)}<br/><span class="muted">วงเงิน ${esc(o.award)} / งบ ${esc(o.budget)}</span></td>
  <td>${esc(o.text)}</td>
  <td>${esc(o.suggestedCheck)}</td>
</tr>`
        )
        .join('');
      return `<h2>${esc(sec)} (${rows.length})</h2>
<table>
<thead><tr><th>กฎ</th><th>โครงการ</th><th>ผู้รับจ้าง/มูลค่า</th><th>สังเกตการณ์</th><th>แนวทางตรวจต่อ</th></tr></thead>
<tbody>${body}</tbody>
</table>`;
    })
    .join('\n');

  const docs = pack.documentRequests.map((d) => `<li>${esc(d)}</li>`).join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8"/>
<title>ชุดสังเกตการณ์มูลค่าเงิน — ${esc(pack.agencyName)}</title>
<style>
  @page { margin: 16mm; }
  body { font-family: "TH Sarabun New", "Sarabun", "Noto Sans Thai", sans-serif; font-size: 15px; color: #111; line-height: 1.4; max-width: 960px; margin: 0 auto; padding: 20px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 22px 0 8px; border-bottom: 1px solid #bbb; padding-bottom: 4px; }
  .meta { color: #444; font-size: 13px; }
  .box { border: 1px solid #bbb; padding: 12px; margin: 12px 0; background: #fafafa; }
  .disclaimer { font-size: 12.5px; color: #555; border-left: 3px solid #888; padding-left: 10px; margin: 14px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 8px; }
  th, td { border: 1px solid #ccc; padding: 6px 7px; vertical-align: top; text-align: left; }
  th { background: #f0f0ee; }
  .muted { color: #666; font-size: 11.5px; }
  .actions { margin-bottom: 14px; }
  @media print { .actions { display: none; } body { padding: 0; } }
</style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">พิมพ์ / บันทึก PDF</button></div>
  <p class="meta">TRACE24 · ชุดสังเกตการณ์มูลค่าเงิน (งานตรวจ / สตง.)</p>
  <h1>${esc(pack.agencyName)}</h1>
  <p class="meta">${esc(pack.agencyId)}${pack.province ? ` · จ.${esc(pack.province)}` : ''}${
    pack.agencyType ? ` · ${esc(pack.agencyType)}` : ''
  }</p>
  <div class="disclaimer">${esc(pack.disclaimer)}</div>
  <div class="box">
    <div>โครงการในรายงาน: <strong>${pack.summary.projectCount}</strong></div>
    <div>ประเด็นมูลค่าเงิน: <strong>${pack.summary.observationCount}</strong> (High ${pack.summary.highCount})</div>
    <div>มูลค่ารวมโดยประมาณ: <strong>${esc(pack.summary.totalAwardLabel)}</strong></div>
    <div>สร้างเมื่อ: ${esc(new Date(pack.generatedAt).toLocaleString('th-TH'))}</div>
  </div>
  <h2>สรุปตามหมวด</h2>
  <ul>${bySec || '<li>ไม่พบสัญญาณมูลค่าเงินในแคชนี้ — ยังใช้เป็นฐานขอเอกสารได้</li>'}</ul>
  <h2>ผู้รับจ้างมูลค่าสูง (จากแคช)</h2>
  <table>
    <thead><tr><th>ผู้รับจ้าง</th><th>มูลค่า</th><th>สัญญา</th></tr></thead>
    <tbody>${winners}</tbody>
  </table>
  ${sections || '<p class="meta">ยังไม่มีแถวสังเกตการณ์ — ตรวจความครบของ contracts-cache</p>'}
  <h2>เอกสารที่ควรขอเพื่อตรวจต่อ</h2>
  <ol>${docs}</ol>
  <p class="meta">แหล่ง: contracts-cache + กฎตรวจมูลค่าเงิน TRACE24 · ไม่ใช่รายงาน สตง. อย่างเป็นทางการ</p>
</body>
</html>`;
}
