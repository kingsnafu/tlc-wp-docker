/**
 * Generic form handler — Cloudflare Worker
 *
 * Accepts any form submission via POST (JSON body), validates required fields,
 * checks honeypot + optional Turnstile, and forwards to Mailgun as email.
 *
 * Environment variables (set in wrangler.toml or CF dashboard):
 *   MAILGUN_API_KEY    — Mailgun API key
 *   MAILGUN_DOMAIN     — Mailgun sending domain (e.g. mg.example.com)
 *   FROM_EMAIL         — Sender address (e.g. noreply@example.com)
 *   TO_EMAIL           — Recipient address
 *   SITE_NAME          — Used in email subject (e.g. "Big Easy Petaluma")
 *   ALLOWED_ORIGINS    — Comma-separated allowed origins (e.g. "https://example.com,https://www.example.com")
 *   TURNSTILE_SECRET   — (optional) Cloudflare Turnstile secret key for bot protection
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = parseOrigins(env.ALLOWED_ORIGINS || '');

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, origin, allowedOrigins);
    }

    if (request.method !== 'POST') {
      return corsResponse(json({ error: 'Method not allowed' }), 405, origin, allowedOrigins);
    }

    // Reject oversized payloads before reading body (32 KB limit)
    const contentLength = parseInt(request.headers.get('Content-Length') || '0');
    if (contentLength > 32768) {
      return corsResponse(json({ error: 'Payload too large.' }), 413, origin, allowedOrigins);
    }

    // Parse body
    let data;
    try {
      data = await request.json();
    } catch {
      return corsResponse(json({ error: 'Invalid request body' }), 400, origin, allowedOrigins);
    }

    // Honeypot — silently accept bot submissions without sending
    if (data._honeypot) {
      return corsResponse(json({ success: true }), 200, origin, allowedOrigins);
    }

    // Turnstile verification (mandatory when TURNSTILE_SECRET is configured)
    if (env.TURNSTILE_SECRET) {
      const token = data['cf-turnstile-response'];
      if (!token) {
        return corsResponse(json({ error: 'Bot verification required.' }), 403, origin, allowedOrigins);
      }
      const verified = await verifyTurnstile(token, env.TURNSTILE_SECRET, request);
      if (!verified) {
        return corsResponse(json({ error: 'Bot verification failed. Please try again.' }), 403, origin, allowedOrigins);
      }
    }

    // Extract form metadata vs field data
    const formName = data._formName || 'Contact Form';
    const replyTo = data.email || data.Email || '';

    // Remove internal fields before building email body
    const internalKeys = new Set(['_honeypot', '_formName', '_formId', 'cf-turnstile-response']);
    const fields = Object.entries(data)
      .filter(([k]) => !internalKeys.has(k))
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');

    if (fields.length === 0) {
      return corsResponse(json({ error: 'No form data received.' }), 400, origin, allowedOrigins);
    }

    // Basic email validation if email field is present
    if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
      return corsResponse(json({ error: 'Invalid email address.' }), 400, origin, allowedOrigins);
    }

    // Build email body from all submitted fields
    const siteName = env.SITE_NAME || 'Website';
    const maxLabelLen = Math.max(...fields.map(([k]) => formatLabel(k).length));
    const emailBody = fields
      .map(([k, v]) => {
        const label = formatLabel(k).padEnd(maxLabelLen);
        const value = Array.isArray(v) ? v.join(', ') : String(v);
        return `${label}  ${value}`;
      })
      .join('\n');

    const subject = `${formName} submission from ${siteName}`;

    // Send via Mailgun
    const mailgunForm = new FormData();
    mailgunForm.append('from', `${siteName} <${env.FROM_EMAIL}>`);
    mailgunForm.append('to', env.TO_EMAIL);
    if (replyTo) mailgunForm.append('h:Reply-To', replyTo);
    mailgunForm.append('subject', subject);
    mailgunForm.append('text', `New ${formName} submission:\n\n${emailBody}`);

    try {
      const mgRes = await fetch(
        `https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`,
        {
          method: 'POST',
          headers: { Authorization: 'Basic ' + btoa('api:' + env.MAILGUN_API_KEY) },
          body: mailgunForm,
        }
      );
      if (!mgRes.ok) {
        const err = await mgRes.text();
        console.error('Mailgun error:', err);
        return corsResponse(json({ error: 'Failed to send. Please try again.' }), 500, origin, allowedOrigins);
      }
    } catch (e) {
      console.error('Mailgun fetch error:', e);
      return corsResponse(json({ error: 'Failed to send. Please try again.' }), 500, origin, allowedOrigins);
    }

    return corsResponse(json({ success: true }), 200, origin, allowedOrigins);
  },
};

/**
 * Verify Cloudflare Turnstile token.
 */
async function verifyTurnstile(token, secret, request) {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: request.headers.get('CF-Connecting-IP') || '',
      }),
    });
    const result = await res.json();
    return result.success === true;
  } catch {
    return false;
  }
}

/**
 * Convert camelCase or snake_case field names to human-readable labels.
 * e.g. "firstName" → "First Name", "phone_number" → "Phone Number"
 */
function formatLabel(key) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')    // camelCase → spaces
    .replace(/[_-]/g, ' ')                     // snake_case/kebab → spaces
    .replace(/\b\w/g, c => c.toUpperCase());   // capitalize words
}

function json(obj) {
  return JSON.stringify(obj);
}

function parseOrigins(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function corsResponse(body, status, origin, allowedOrigins) {
  const matched = origin && (
    allowedOrigins.includes(origin) ||
    origin.endsWith('.pages.dev')
  );

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Only set CORS header for known origins — reject unknown
  if (matched) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return new Response(body, { status, headers });
}
