import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const BASE = 'https://api.cloudflare.com/client/v4';
const ASSETS_BASE = `${BASE}/pages/assets`;
const BATCH_UPLOAD = 25;
const BATCH_CHECK = 7500;

/**
 * Deploy static site to Cloudflare Pages.
 * Port of deploy-local.py — uses upload token + direct asset upload API.
 */
export async function deploy(config) {
  const { account_id, project_name, api_token: configToken } = config.cloudflare || {};
  const token = configToken || process.env.CF_API_TOKEN || '';
  const staticDir = join(process.cwd(), '_site');

  console.log('Cloudflare Pages Deploy');
  console.log(`  Project: ${project_name}`);
  console.log(`  Static dir: ${staticDir}`);

  if (!token) throw new Error('No Cloudflare API token. Set cloudflare.api_token in config or CF_API_TOKEN env var.');
  if (!account_id) throw new Error('No cloudflare.account_id in config.');
  if (!project_name) throw new Error('No cloudflare.project_name in config.');

  // 1. Get upload token
  console.log('\n[1] Getting upload token...');
  const tokResp = await cfRequest('GET',
    `${BASE}/accounts/${account_id}/pages/projects/${project_name}/upload-token`, null, token);
  const uploadToken = tokResp.result.jwt;
  console.log('    OK');

  // 2. Hash all files
  console.log('\n[2] Hashing files...');
  const files = walkDir(staticDir);
  console.log(`    ${Object.keys(files).length} files`);

  // 3. Check which files need uploading
  console.log('\n[3] Checking which files are needed...');
  const allHashes = Object.values(files).map(f => f.hash);
  const missing = new Set();
  for (let i = 0; i < allHashes.length; i += BATCH_CHECK) {
    const batch = allHashes.slice(i, i + BATCH_CHECK);
    const resp = await cfRequest('POST', `${ASSETS_BASE}/check-missing`,
      { hashes: batch }, uploadToken);
    for (const h of (resp.result || [])) missing.add(h);
  }
  console.log(`    ${missing.size} to upload`);

  // 4. Upload missing files
  if (missing.size > 0) {
    const hashMap = {};
    for (const [rel, info] of Object.entries(files)) {
      hashMap[info.hash] = { rel, path: info.path };
    }

    const toUpload = [...missing].filter(h => hashMap[h]).map(h => [h, hashMap[h]]);
    let done = 0;

    console.log(`\n[4] Uploading ${toUpload.length} files...`);
    for (let i = 0; i < toUpload.length; i += BATCH_UPLOAD) {
      const batch = toUpload.slice(i, i + BATCH_UPLOAD);
      const payload = batch.map(([hash, { path: fpath }]) => {
        const content = readFileSync(fpath);
        const mime = guessMime(fpath);
        return {
          key: hash,
          value: content.toString('base64'),
          metadata: { contentType: mime },
          base64: true,
        };
      });

      await cfRequest('POST', `${ASSETS_BASE}/upload`, payload, uploadToken);
      done += batch.length;
      console.log(`    ${done}/${toUpload.length}`);
    }
    console.log('    Upload complete.');
  } else {
    console.log('\n[4] All files cached.');
  }

  // 5. Create deployment
  console.log('\n[5] Creating deployment...');
  const manifest = {};
  for (const [rel, info] of Object.entries(files)) {
    manifest[rel] = info.hash;
  }

  const resp = await cfMultipart(
    `${BASE}/accounts/${account_id}/pages/projects/${project_name}/deployments`,
    { branch: 'main', manifest },
    token
  );

  if (resp.success) {
    const url = resp.result?.url || '';
    console.log(`\nDeployed: ${url}`);
  } else {
    throw new Error(`Deploy failed: ${JSON.stringify(resp.errors)}`);
  }
}

/**
 * Walk directory and hash all files.
 */
function walkDir(dir, base = dir) {
  const files = {};

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '_redirects') continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(files, walkDir(fullPath, base));
    } else {
      const rel = '/' + relative(base, fullPath).replace(/\\/g, '/');
      const content = readFileSync(fullPath);
      const hash = createHash('md5').update(content).digest('hex');
      files[rel] = { path: fullPath, hash };
    }
  }

  return files;
}

/**
 * Make a JSON request to the Cloudflare API.
 */
async function cfRequest(method, url, data, token) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'wp-to-static/1.0',
    },
  };

  if (data !== null && data !== undefined) {
    opts.body = JSON.stringify(data);
  }

  const res = await fetch(url, opts);
  const body = await res.json();

  if (!res.ok) {
    throw new Error(`CF API ${res.status}: ${JSON.stringify(body.errors || body).slice(0, 500)}`);
  }

  return body;
}

/**
 * POST multipart/form-data to Cloudflare API.
 */
async function cfMultipart(url, fields, token) {
  const boundary = '----FormBoundary' + createHash('md5').update(String(Date.now())).digest('hex');
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === 'object') {
      parts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${name}"\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${JSON.stringify(value)}\r\n`
      );
    } else {
      parts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
        `${value}\r\n`
      );
    }
  }
  parts.push(`--${boundary}--\r\n`);

  const body = parts.join('');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'User-Agent': 'wp-to-static/1.0',
    },
    body,
  });

  return res.json();
}

/**
 * Basic MIME type guessing.
 */
function guessMime(filepath) {
  const ext = filepath.split('.').pop()?.toLowerCase();
  const mimes = {
    html: 'text/html', css: 'text/css', js: 'application/javascript',
    json: 'application/json', xml: 'application/xml', svg: 'image/svg+xml',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
    pdf: 'application/pdf', txt: 'text/plain', map: 'application/json',
  };
  return mimes[ext] || 'application/octet-stream';
}
