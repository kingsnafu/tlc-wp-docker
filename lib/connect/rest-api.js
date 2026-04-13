/**
 * WordPress REST API client using native fetch.
 * Handles pagination and optional Basic auth (Application Passwords).
 */

const API_TIMEOUT = 30_000; // 30 seconds per request

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
    const res = await fetch(url, { headers: headers(config), signal: AbortSignal.timeout(API_TIMEOUT) });

    if (res.status === 400) {
      // WP returns 400 with this code when page exceeds total — any other 400 is a real error
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
