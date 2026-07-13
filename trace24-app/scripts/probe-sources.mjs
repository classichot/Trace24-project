const urls = [
  'https://procurement.nakornnont.go.th/news_announce',
  'https://www.phothale.go.th/egp/12',
];

for (const url of urls) {
  const r = await fetch(url);
  const html = await r.text();
  console.log('===', url);
  console.log('status', r.status, 'len', html.length);
  const countMatch = html.match(/พบทั้งหมด\s*([\d,]+)\s*รายการ/);
  if (countMatch) console.log('count', countMatch[1]);
  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)];
  console.log('tr count', rows.length);
  const announceRows = rows.filter((row) => /ประกาศ|e-bidding|เฉพาะเจาะจง|ผู้ชนะ/i.test(row));
  console.log('announce rows', announceRows.length);
  if (announceRows[0]) {
    const text = announceRows[0][0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log('sample', text.slice(0, 200));
  }
}
