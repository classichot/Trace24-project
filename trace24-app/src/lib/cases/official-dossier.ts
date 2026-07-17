import type { OversightCase } from './types';

const DISCLAIMER =
  'เอกสารนี้เป็นเครื่องมือจัดลำดับการตรวจสอบจากข้อมูลสาธารณะและบันทึกสำนวนภายใน — ไม่ใช่ข้อพิสูจน์การทุจริต ความผิดทางอาญา หรือคำวินิจฉัยของหน่วยงานที่มีอำนาจ';

function esc(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

/** Formal Thai oversight dossier (HTML printable → PDF). */
export function buildOfficialDossierHtml(c: OversightCase): string {
  const missing =
    c.missingDocuments?.length > 0
      ? c.missingDocuments.map((d) => `<li>${esc(d)}</li>`).join('')
      : '<li>ยังไม่ได้ระบุเอกสารที่ขาด</li>';
  const citations =
    c.citations?.length > 0
      ? c.citations
          .map(
            (x) =>
              `<li><strong>${esc(x.label)}</strong>${
                x.detail ? ` — ${esc(x.detail)}` : ''
              }${x.url ? ` · <a href="${esc(x.url)}">${esc(x.url)}</a>` : ''}</li>`
          )
          .join('')
      : '<li>ยังไม่มีแหล่งอ้างอิง</li>';
  const notes =
    c.notes?.length > 0
      ? c.notes
          .map(
            (n) =>
              `<tr><td>${esc(fmtDate(n.at))}</td><td>${esc(n.by)}</td><td>${esc(n.text)}</td></tr>`
          )
          .join('')
      : '<tr><td colspan="3">ยังไม่มีบันทึก</td></tr>';
  const tags = (c.signalTags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ');

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8"/>
<title>สำนวน TRACE24 — ${esc(c.id)}</title>
<style>
  @page { margin: 18mm 16mm; }
  body { font-family: "TH Sarabun New", "Sarabun", "Noto Sans Thai", sans-serif; font-size: 16px; color: #111; line-height: 1.45; max-width: 800px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 22px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .meta { color: #444; font-size: 14px; }
  .box { border: 1px solid #bbb; padding: 12px 14px; margin: 12px 0; background: #fafafa; }
  .tag { display: inline-block; border: 1px solid #999; padding: 1px 8px; margin: 2px 4px 2px 0; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f0f0ee; }
  .disclaimer { font-size: 13px; color: #555; border-left: 3px solid #888; padding-left: 10px; margin: 16px 0; }
  .actions { margin: 16px 0; }
  @media print { .actions { display: none; } body { padding: 0; } }
</style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">พิมพ์ / บันทึก PDF</button>
  </div>
  <p class="meta">TRACE24 · รายงานราชการเบื้องต้น (ร่างสำนวน)</p>
  <h1>${esc(c.title)}</h1>
  <p class="meta">เลขสำนวน ${esc(c.id)} · สถานะ ${esc(c.status)} · ลำดับความสำคัญ ${esc(c.priority)}</p>

  <div class="disclaimer">${esc(DISCLAIMER)}</div>

  <div class="box">
    <div><strong>หน่วยงาน:</strong> ${esc(c.agencyName)} (${esc(c.agencyId)})</div>
    <div><strong>ประเภท:</strong> ${esc(c.agencyType || '—')} · <strong>จังหวัด:</strong> ${esc(c.province || '—')}</div>
    <div><strong>ผู้เปิด:</strong> ${esc(c.openedBy)} · <strong>เปิดเมื่อ:</strong> ${esc(fmtDate(c.openedAt))}</div>
    <div><strong>ผู้รับผิดชอบ:</strong> ${esc(c.assignee || 'ยังไม่มอบหมาย')}</div>
    <div><strong>อัปเดตล่าสุด:</strong> ${esc(fmtDate(c.updatedAt))}</div>
    ${
      c.score100 != null
        ? `<div><strong>คะแนนจัดลำดับตรวจ (snapshot):</strong> ${esc(String(c.score100))} / 100 — ไม่ใช่คะแนนความผิด</div>`
        : ''
    }
  </div>

  <h2>1. สรุปประเด็น</h2>
  <p>${esc(c.summary)}</p>
  <p>${tags || '<span class="meta">ไม่มีแท็กสัญญาณ</span>'}</p>

  <h2>2. เอกสารที่ยังขาด / ต้องขอเพิ่ม</h2>
  <ol>${missing}</ol>

  <h2>3. แหล่งอ้างอิงและหลักฐานอ้างอิง</h2>
  <ol>${citations}</ol>

  <h2>4. บันทึกการดำเนินงาน</h2>
  <table>
    <thead><tr><th>เวลา</th><th>โดย</th><th>บันทึก</th></tr></thead>
    <tbody>${notes}</tbody>
  </table>

  <h2>5. คำขอถัดไป (ร่าง)</h2>
  <ol>
    <li>ขอเอกสารประกาศ/TOR/รายงานพิจารณาผลจากหน่วยงาน</li>
    <li>ตรวจความเชื่อมโยงผู้บริหารกับผู้รับจ้าง (ถ้ามีสัญญาณ)</li>
    <li>สรุปส่งหัวหน้าก่อนปิดเรื่องหรือขยายการตรวจ</li>
  </ol>

  <p class="meta" style="margin-top:28px">สร้างจาก TRACE24 · ${esc(new Date().toISOString())}</p>
</body>
</html>`;
}

export function buildOfficialDossierMarkdown(c: OversightCase): string {
  const lines = [
    `# สำนวนราชการเบื้องต้น — ${c.title}`,
    ``,
    `> ${DISCLAIMER}`,
    ``,
    `- เลขสำนวน: ${c.id}`,
    `- หน่วยงาน: ${c.agencyName} (${c.agencyId})`,
    `- จังหวัด: ${c.province || '—'} · ประเภท: ${c.agencyType || '—'}`,
    `- สถานะ: ${c.status} · ความสำคัญ: ${c.priority}`,
    `- ผู้รับผิดชอบ: ${c.assignee || 'ยังไม่มอบหมาย'}`,
    `- เปิด: ${c.openedAt} โดย ${c.openedBy}`,
    `- อัปเดต: ${c.updatedAt}`,
    c.score100 != null ? `- คะแนนจัดลำดับตรวจ: ${c.score100}/100` : '',
    ``,
    `## สรุป`,
    c.summary,
    ``,
    `## แท็กสัญญาณ`,
    ...(c.signalTags?.length ? c.signalTags.map((t) => `- ${t}`) : ['- —']),
    ``,
    `## เอกสารที่ขาด`,
    ...(c.missingDocuments?.length
      ? c.missingDocuments.map((d) => `- ${d}`)
      : ['- —']),
    ``,
    `## แหล่งอ้างอิง`,
    ...(c.citations?.length
      ? c.citations.map(
          (x) => `- ${x.label}${x.detail ? ` — ${x.detail}` : ''}${x.url ? ` (${x.url})` : ''}`
        )
      : ['- —']),
    ``,
    `## บันทึก`,
    ...(c.notes?.length
      ? c.notes.map((n) => `- [${n.at}] ${n.by}: ${n.text}`)
      : ['- —']),
    ``,
  ];
  return lines.filter((l) => l !== undefined).join('\n');
}
