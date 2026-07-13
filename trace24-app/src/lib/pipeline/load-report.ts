import 'server-only';

import fs from 'fs';
import path from 'path';
import type { PipelineReportLike } from './types';

export function loadAgencyReport(id: string): PipelineReportLike | null {
  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'real', `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as PipelineReportLike;
}

export function listCachedAgencyIds(): string[] {
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'real');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}
