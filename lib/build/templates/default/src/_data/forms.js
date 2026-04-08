import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export default function() {
  const path = resolve(process.cwd(), 'data', 'forms.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8'));
}
