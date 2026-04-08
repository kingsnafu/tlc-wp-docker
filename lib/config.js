import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const REQUIRED = [
  'wordpress.url',
  'wordpress.container',
  'wordpress.db_user',
  'wordpress.db_password',
  'wordpress.db_name',
];

function get(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

export function loadConfig(dir = process.cwd()) {
  const configPath = resolve(dir, 'site-config.yaml');
  if (!existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}\nCopy templates/site-config.example.yaml to site-config.yaml`);
  }

  const raw = readFileSync(configPath, 'utf8');
  const config = yaml.load(raw);

  const missing = REQUIRED.filter(p => !get(config, p));
  if (missing.length) {
    throw new Error(`Missing required config fields:\n  ${missing.join('\n  ')}`);
  }

  // Defaults
  config.wordpress.table_prefix ??= 'wp_';
  config.wordpress.url = config.wordpress.url.replace(/\/$/, '');

  // Cloudflare token from env fallback
  if (config.cloudflare && !config.cloudflare.api_token) {
    config.cloudflare.api_token = process.env.CF_API_TOKEN || '';
  }

  return config;
}
