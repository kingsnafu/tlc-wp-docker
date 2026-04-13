/**
 * WordPress REST API client using native fetch.
 * Handles pagination and optional Basic auth (Application Passwords).
 */

const API_TIMEOUT = 120_000; // 120 seconds per request (heavy plugin stacks are slow)

function headers(config) {
  const h = { 'Accept': 'application/json' };
  if (config.wordpress.app_password) {
    const creds = Buffer.from(`${config.wordpress.app_user}:${config.wordpress.app_password}`).toString('base64');
    h['Authorization'] = `Basic ${creds}`;
  }
  return h;
}

/**
 * Fetch a single REST API endpoint.
 */
export async function fetchOne(endpoint, config) {
  const url = `${config.wordpress.url}/wp-json${endpoint}`;
  const res = await fetch(url, { headers: headers(config), signal: AbortSignal.timeout(API_TIMEOUT) });
  if (!res.ok) {
    throw new Error(`REST API ${res.status}: ${url}`);
  }
  return res.json();
}

/**
 * Fetch all pages of a paginated REST API endpoint.
 * Returns the combined array of all items.
 */
export async function fetchAll(endpoint, config) {
  const baseUrl = `${config.wordpress.url}/wp-json${endpoint}`;
  const separator = endpoint.includes('?') ? '&' : '?';
  const items = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}${separator}page=${page}`;
    let res;
    let lastErr;

    // Retry up to 3 times on 5xx or network errors
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(url, { headers: headers(config), signal: AbortSignal.timeout(API_TIMEOUT) });
        if (res.status < 500) break; // not a server error, stop retrying
        lastErr = new Error(`REST API ${res.status}: ${url}`);
      } catch (err) {
        lastErr = err;
      }
      if (attempt < 2) {
        const delay = (attempt + 1) * 5000; // 5s, 10s backoff
        console.warn(`  Retry ${attempt + 1}/2 for ${url} (${lastErr.message})`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    if (!res || res.status >= 500) {
      throw lastErr || new Error(`REST API failed after retries: ${url}`);
    }

    if (res.status === 400) {
      const body = await res.json().catch(() => ({}));
      if (body.code === 'rest_post_invalid_page_number') break;
      throw new Error(`REST API 400: ${url} — ${body.message || 'Bad Request'}`);
    }

    if (!res.ok) {
      throw new Error(`REST API ${res.status}: ${url}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    items.push(...data);

    const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1');
    if (page >= totalPages) break;
    page++;
  }

  return items;
}
