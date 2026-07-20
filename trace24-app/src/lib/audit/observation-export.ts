/**
 * Client-safe export helpers for the observation pack (text / Word / PDF via print).
 */
import { buildAuditObservationHtml } from './observation-html';
import type { AuditObservationPack } from './observation-types';
import { OBSERVATION_PACK_TITLE } from './observation-types';

function safeFilename(name: string) {
  return String(name || 'agency')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Plain-text workpaper for notes / email paste. */
export function buildAuditObservationText(pack: AuditObservationPack): string {
  const lines: string[] = [];
  lines.push(`TRACE24 · ${OBSERVATION_PACK_TITLE}`);
  lines.push(pack.agencyName);
  lines.push(
    [
      pack.agencyId,
      pack.province ? `จ.${pack.province}` : '',
      pack.agencyType || '',
    ]
      .filter(Boolean)
      .join(' · ')
  );
  lines.push(`สร้างเมื่อ: ${new Date(pack.generatedAt).toLocaleString('th-TH')}`);
  if (pack.aiModel) lines.push(`AI: ${pack.aiModel}`);
  lines.push('');
  lines.push(pack.disclaimer);
  if (pack.aiError) lines.push(`AI error: ${pack.aiError}`);
  lines.push('');
  lines.push('— สรุป —');
  lines.push(`โครงการในรายงาน: ${pack.summary.projectCount}`);
  lines.push(
    `ประเด็น: ${pack.summary.observationCount} (High ${pack.summary.highCount})`
  );
  lines.push(`มูลค่ารวมโดยประมาณ: ${pack.summary.totalAwardLabel}`);
  lines.push('');

  if (pack.aiNarrative) {
    lines.push('— สรุปภาพรวมโดย AI —');
    lines.push(pack.aiNarrative);
    lines.push('');
  }

  lines.push('— สรุปตามหมวด —');
  for (const [k, v] of Object.entries(pack.summary.bySection)) {
    lines.push(`• ${k}: ${v}`);
  }
  if (!Object.keys(pack.summary.bySection).length) {
    lines.push('• ยังไม่พบสัญญาณมูลค่าเงินในแคชนี้');
  }
  lines.push('');

  lines.push('— ผู้รับจ้างมูลค่าสูง —');
  for (const w of pack.topWinners) {
    lines.push(`• ${w.name} · ${w.total}${w.shareHint ? ` · ${w.shareHint}` : ''}`);
  }
  if (!pack.topWinners.length) lines.push('• ไม่มีข้อมูล');
  lines.push('');

  const grouped = new Map<string, typeof pack.observations>();
  for (const o of pack.observations) {
    const list = grouped.get(o.section) || [];
    list.push(o);
    grouped.set(o.section, list);
  }
  for (const [sec, rows] of grouped) {
    lines.push(`— ${sec} (${rows.length}) —`);
    for (const o of rows) {
      lines.push(`[${o.severity}] ${o.ruleTag}`);
      lines.push(`โครงการ: ${o.projectName} (${o.projectId}) · ปีงบ ${o.fy}`);
      lines.push(`ผู้รับจ้าง: ${o.winner} · วงเงิน ${o.award} / งบ ${o.budget}`);
      lines.push(o.text);
      if (o.suspicionWhy) lines.push(`ทำไมน่าสงสัย: ${o.suspicionWhy}`);
      if (o.innocentAlternative) lines.push(`คำอธิบายที่เป็นไปได้: ${o.innocentAlternative}`);
      if (o.whatToVerify) lines.push(`ควรตรวจยืนยัน: ${o.whatToVerify}`);
      lines.push(`แนวทางตรวจต่อ: ${o.suggestedCheck}`);
      lines.push('');
    }
  }

  lines.push('— เอกสารที่ควรขอ —');
  pack.documentRequests.forEach((d, i) => lines.push(`${i + 1}. ${d}`));
  lines.push('');
  lines.push('แหล่ง: contracts-cache + กฎ TRACE24 · ไม่ใช่รายงานอย่างเป็นทางการ');
  return lines.join('\n');
}

/** Word-openable HTML (.doc) — no extra dependency. */
export function buildAuditObservationWordHtml(pack: AuditObservationPack): string {
  // Word opens HTML with Word XML namespace reasonably well
  const inner = buildAuditObservationHtml(pack)
    .replace(/<div class="actions">[\s\S]*?<\/div>/, '')
    .replace(/@media print[\s\S]*?}/g, '');
  return inner.replace(
    '<html lang="th">',
    '<html lang="th" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">'
  );
}

export function exportObservationPack(
  pack: AuditObservationPack,
  format: 'pdf' | 'text' | 'word'
) {
  const base = `TRACE24_${safeFilename(pack.agencyName)}_${OBSERVATION_PACK_TITLE}`;
  if (format === 'text') {
    downloadBlob(
      `${base}.txt`,
      new Blob([buildAuditObservationText(pack)], { type: 'text/plain;charset=utf-8' })
    );
    return;
  }
  if (format === 'word') {
    downloadBlob(
      `${base}.doc`,
      new Blob(['\ufeff', buildAuditObservationWordHtml(pack)], {
        type: 'application/msword;charset=utf-8',
      })
    );
    return;
  }
  // PDF: open print-ready HTML (user chooses "Save as PDF")
  const html = buildAuditObservationHtml(pack);
  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch {
        /* user can print manually */
      }
    }, 400);
    return;
  }
  downloadBlob(
    `${base}.html`,
    new Blob([html], { type: 'text/html;charset=utf-8' })
  );
}
