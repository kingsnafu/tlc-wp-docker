import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

export default function() {
  const configPath = resolve(process.cwd(), 'site-config.yaml');
  const raw = readFileSync(configPath, 'utf8');
  const config = yaml.load(raw);

  return {
    name: config.site?.name || '',
    url: config.site?.url || '',
    tagline: config.site?.tagline || '',
    theme: config.theme || {},
    calendar: config.calendar || null,
  };
}
