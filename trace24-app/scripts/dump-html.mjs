const url = 'https://procurement.nakornnont.go.th/news_announce';
const r = await fetch(url);
const html = await r.text();
const fs = await import('fs');
fs.writeFileSync('scripts/nakornnont-sample.html', html, 'utf8');

const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
if (tableMatch) {
  fs.writeFileSync('scripts/nakornnont-table.html', tableMatch[0], 'utf8');
  console.log('table saved', tableMatch[0].length);
}

const ph = await fetch('https://www.phothale.go.th/egp/12');
const phHtml = await ph.text();
fs.writeFileSync('scripts/phothale-sample.html', phHtml, 'utf8');
const phTable = phHtml.match(/<table[\s\S]*?<\/table>/i);
if (phTable) {
  fs.writeFileSync('scripts/phothale-table.html', phTable[0], 'utf8');
  console.log('phothale table', phTable[0].length);
}
