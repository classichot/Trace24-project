import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(
  path.join(__dirname, '../../design-reference/TRACE24 Prototype.dc.html'),
  'utf8'
);

const start = html.indexOf('  D = {');
const end = html.indexOf('  renderVals()');
if (start === -1 || end === -1) {
  console.error('Could not find data block');
  process.exit(1);
}

let code = html.slice(start, end).trim();
code = code.replace(/^D = /, 'export const D = ');
code = code.replace(/;\s*H = /, ';\n\nexport const H = ');
code = code.replace(/;\s*C = /, ';\n\nexport const C = ');

const out = `// Auto-extracted from TRACE24 Prototype.dc.html
// @ts-nocheck

${code}
`;

const outPath = path.join(__dirname, '../src/lib/data.ts');
fs.writeFileSync(outPath, out);
console.log('Written', outPath, fs.statSync(outPath).size, 'bytes');
