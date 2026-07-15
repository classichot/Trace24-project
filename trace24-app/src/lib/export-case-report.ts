/**
 * Client-side case / investigation report export (Markdown + printable HTML).
 */

export type CaseReportExportInput = {
  agencyId: string | null;
  agencyName?: string;
  agencyLoc?: string;
  caseFile: {
    id: string;
    title: string;
    summary: string;
    status: string;
    opened: string;
    owner: string;
    signals?: string;
    evidence?: string[];
    questions?: string[][];
    timeline?: string[][];
    parties?: (string | boolean | undefined)[][];
    money?: (string | boolean | undefined)[][];
  };
  notes?: { date: string; text: string }[];
  alerts?: { tag?: string; text?: string; sevKey?: string }[];
  relatedMatches?: {
    ruleId?: string;
    matchType?: string;
    severity?: string;
    explanation?: string;
  }[];
  relatedCoverage?: string;
  reviewStates?: Record<string, string>;
  pack?: {
    generatedAt?: string;
    caseBrief?: {
      summary?: string;
      riskExplanation?: string;
      keyFindings?: string[];
      scoreDisclaimer?: string;
    };
    leads?: {
      question: string;
      why: string;
      priority: string;
      missingDocuments?: string[];
      nextActions?: string[];
    }[];
    risk?: { overall?: string | number; score100?: number };
    missingInfo?: { expected: string; observed: string; gapScore?: number }[];
    facts?: { statement: string }[];
  } | null;
  disclaimer?: string;
};

function line(s: string) {
  return String(s || '').replace(/\r\n/g, '\n').trim();
}

function bulletList(items: string[]) {
  if (!items.length) return '_ไม่มี_\n';
  return items.map((i) => `- ${i}`).join('\n') + '\n';
}

export function buildCaseReportMarkdown(input: CaseReportExportInput): string {
  const cf = input.caseFile;
  const now = new Date().toISOString();
  const disclaimer =
    input.disclaimer ||
    'รายงานนี้เป็นเครื่องมือจัดลำดับการตรวจสอบจากข้อมูลสาธารณะ — ไม่ใช่ข้อพิสูจน์การทุจริตหรือความผิดทางอาญา';

  const parts: string[] = [
    `# TRACE24 — สำนวนหลักฐาน`,
    ``,
    `**หน่วยงาน:** ${input.agencyName || '—'} ${input.agencyLoc ? `(${input.agencyLoc})` : ''}`,
    `**รหัส:** ${input.agencyId || '—'}`,
    `**สำนวน:** ${cf.id} · ${cf.status}`,
    `**เปิด:** ${cf.opened} · **ผู้ตรวจ:** ${cf.owner}`,
    `**ส่งออกเมื่อ:** ${now}`,
    ``,
    `> ${disclaimer}`,
    ``,
    `## สรุป`,
    line(cf.summary) || '_ยังไม่มีสรุป_',
    ``,
  ];

  if (input.pack?.caseBrief?.summary) {
    parts.push(`## สรุปจากผู้ช่วยสอบสวน`, line(input.pack.caseBrief.summary), ``);
    if (input.pack.caseBrief.riskExplanation) {
      parts.push(line(input.pack.caseBrief.riskExplanation), ``);
    }
    if (input.pack.caseBrief.keyFindings?.length) {
      parts.push(`### ข้อค้นพบสำคัญ`);
      parts.push(bulletList(input.pack.caseBrief.keyFindings));
    }
  }
  if (input.pack?.risk) {
    parts.push(
      `## ระดับจัดลำดับ`,
      `${input.pack.risk.overall || '—'}${
        input.pack.risk.score100 != null ? ` — ${input.pack.risk.score100}/100` : ''
      }`,
      ``
    );
  }

  if (cf.signals) {
    parts.push(`## สัญญาณในสำนวน`, line(cf.signals), ``);
  }

  const alerts = input.alerts || [];
  parts.push(`## สัญญาณความเสี่ยง (${alerts.length})`);
  parts.push(
    bulletList(
      alerts.map((a) => `[${a.sevKey || a.tag || '—'}] ${a.tag ? `${a.tag}: ` : ''}${a.text || ''}`)
    )
  );

  const matches = input.relatedMatches || [];
  parts.push(`## ความเชื่อมโยงบุคคล (${matches.length})`);
  if (input.relatedCoverage) parts.push(`_ครอบคลุม:_ ${input.relatedCoverage}`, ``);
  parts.push(
    bulletList(
      matches.map(
        (m) =>
          `[${m.ruleId || 'R?'} · ${m.matchType || '—'} · ${m.severity || '—'}] ${m.explanation || ''}`
      )
    )
  );

  const timeline = cf.timeline || [];
  parts.push(`## ไทม์ไลน์`);
  parts.push(
    bulletList(
      timeline.map((t) => `${t[0] ?? ''} — ${t[1] ?? ''}${t[2] ? ` (${t[2]})` : ''}`)
    )
  );

  const questions = cf.questions || [];
  parts.push(`## คำถามที่ยังไม่มีคำตอบ`);
  parts.push(bulletList(questions.map((q) => `${q[0] ?? ''} — _${q[1] ?? ''}_`)));

  const parties = cf.parties || [];
  parts.push(`## คู่กรณี / บุคคลที่เกี่ยวข้อง`);
  parts.push(
    bulletList(parties.map((p) => `${p[0] ?? ''} — ${p[1] ?? ''}${p[2] ? ' ⚠' : ''}`))
  );

  const money = cf.money || [];
  parts.push(`## เส้นทางเงิน`);
  parts.push(bulletList(money.map((m) => `${m[0] ?? ''}: ${m[1] ?? ''}`)));

  const evidence = cf.evidence || [];
  parts.push(`## หลักฐานอ้างอิง`);
  parts.push(bulletList(evidence));

  const notes = input.notes || [];
  parts.push(`## บันทึกของผู้ตรวจ`);
  parts.push(bulletList(notes.map((n) => `${n.date}: ${n.text}`)));

  const reviews = Object.entries(input.reviewStates || {});
  if (reviews.length) {
    parts.push(`## สถานะการตรวจสอบสัญญาณ`);
    parts.push(bulletList(reviews.map(([k, v]) => `${k}: ${v}`)));
  }

  const leads = input.pack?.leads || [];
  if (leads.length) {
    parts.push(`## แนวทางสอบสวน (${leads.length})`);
    for (const lead of leads) {
      parts.push(
        `### [${lead.priority}] ${lead.question}`,
        lead.why,
        lead.missingDocuments?.length
          ? `เอกสารที่ขาด: ${lead.missingDocuments.join(' · ')}`
          : '',
        lead.nextActions?.length ? `ขั้นถัดไป: ${lead.nextActions.join(' · ')}` : '',
        ``
      );
    }
  }

  const facts = input.pack?.facts || [];
  if (facts.length) {
    parts.push(`## ข้อเท็จจริงจากหลักฐาน`);
    parts.push(bulletList(facts.slice(0, 40).map((f) => f.statement)));
  }

  const gaps = input.pack?.missingInfo || [];
  if (gaps.length) {
    parts.push(`## ช่องว่างข้อมูล`);
    parts.push(
      bulletList(
        gaps.slice(0, 30).map(
          (g) =>
            `${g.expected} → ${g.observed}${g.gapScore != null ? ` (gap ${g.gapScore})` : ''}`
        )
      )
    );
  }

  parts.push(
    `---`,
    `_สร้างโดย TRACE24 · สัญญาณความเสี่ยงไม่ใช่ข้อพิสูจน์ · นามสกุลร่วม (R13/R5) เป็น lead เท่านั้น_`
  );

  return parts.filter((p) => p !== undefined).join('\n');
}

export function markdownToPrintableHtml(md: string, title: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Lightweight: keep as preformatted text for reliable Thai print/PDF
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8"/>
<title>${title.replace(/</g, '')}</title>
<style>
  body { font-family: "Sarabun", "Noto Sans Thai", system-ui, sans-serif; max-width: 820px; margin: 32px auto; padding: 0 24px 48px; color: #111; line-height: 1.55; }
  pre { white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: 13.5px; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
<pre>${escaped}</pre>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body>
</html>`;
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportCaseReport(
  input: CaseReportExportInput,
  opts?: { openPrint?: boolean }
): { filename: string } {
  const md = buildCaseReportMarkdown(input);
  const safeId = (input.agencyId || input.caseFile.id || 'case').replace(/[^\w.\-ก-๙]+/g, '_');
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `TRACE24-${safeId}-${stamp}.md`;
  triggerDownload(filename, md, 'text/markdown;charset=utf-8');

  if (opts?.openPrint !== false && typeof window !== 'undefined') {
    const html = markdownToPrintableHtml(md, `TRACE24 ${safeId}`);
    const w = window.open('', '_blank');
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
  }

  return { filename };
}
