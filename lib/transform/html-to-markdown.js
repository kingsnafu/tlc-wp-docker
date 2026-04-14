import TurndownService from 'turndown';
import { cleanHtml } from './clean-content.js';

let turndown;
let cachedWpUrl;

/**
 * Convert absolute WordPress URLs to site-relative paths.
 * External URLs (different origin) are left unchanged.
 * Exported so other modules (menus, etc.) can reuse the same logic.
 */
export function rewriteUrl(url, wpUrl) {
  if (!url || !wpUrl) return url;

  // Strip trailing slash from wpUrl for consistent matching
  const base = wpUrl.replace(/\/+$/, '');

  // Rewrite wp-content/uploads to /images/
  const uploadsRe = new RegExp(`^${escapeRegex(base)}/wp-content/uploads/`);
  if (uploadsRe.test(url)) {
    return url.replace(uploadsRe, '/images/');
  }

  // Also handle relative /wp-content/uploads/ paths
  if (url.startsWith('/wp-content/uploads/')) {
    return url.replace(/^\/wp-content\/uploads\//, '/images/');
  }

  // Rewrite same-origin URLs to relative paths
  if (url.startsWith(base)) {
    return url.slice(base.length) || '/';
  }

  // Handle protocol-relative or mismatched http/https
  const baseWithoutProto = base.replace(/^https?:\/\//, '');
  const urlWithoutProto = url.replace(/^https?:\/\//, '');
  if (urlWithoutProto.startsWith(baseWithoutProto + '/wp-content/uploads/')) {
    return '/images/' + urlWithoutProto.slice(baseWithoutProto.length + '/wp-content/uploads/'.length);
  }
  if (urlWithoutProto.startsWith(baseWithoutProto)) {
    return urlWithoutProto.slice(baseWithoutProto.length) || '/';
  }

  // Catch any localhost URL (DB may store URLs with different port, no port, or protocol-relative)
  const localhostMatch = url.match(/^(?:https?:)?\/\/localhost(?::\d+)?(\/.*)?$/);
  if (localhostMatch) {
    const path = localhostMatch[1] || '/';
    if (path.startsWith('/wp-content/uploads/')) {
      return path.replace(/^\/wp-content\/uploads\//, '/images/');
    }
    return path;
  }

  // Catch-all: any foreign URL pointing to /wp-content/uploads/ (legacy domains, theme demos)
  const uploadsIndex = url.indexOf('/wp-content/uploads/');
  if (uploadsIndex !== -1) {
    return '/images/' + url.slice(uploadsIndex + '/wp-content/uploads/'.length);
  }

  return url;
}

function getTurndown(wpUrl) {
  if (turndown && cachedWpUrl === wpUrl) return turndown;
  cachedWpUrl = wpUrl;

  turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  // Custom rule: rewrite WP image URLs to local paths
  turndown.addRule('wpImages', {
    filter: 'img',
    replacement(content, node) {
      let src = node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || '';

      src = rewriteUrl(src, wpUrl);
      return src ? `![${alt}](${src})` : '';
    },
  });

  // Custom rule: rewrite links pointing to the WP site
  turndown.addRule('wpLinks', {
    filter(node) {
      return node.nodeName === 'A' && node.getAttribute('href');
    },
    replacement(content, node) {
      let href = node.getAttribute('href') || '';
      href = rewriteUrl(href, wpUrl);
      const title = node.getAttribute('title');
      const titlePart = title ? ` "${title}"` : '';
      // Don't wrap if content is just whitespace
      const text = content.trim();
      if (!text) return '';
      return `[${text}](${href}${titlePart})`;
    },
  });

  // Custom rule: strip Elementor wrapper divs, keep content
  turndown.addRule('elementorWrappers', {
    filter(node) {
      return (
        node.nodeName === 'DIV' &&
        /elementor-(?:section|column|widget|element|container|inner)/.test(node.className || '')
      );
    },
    replacement(content) {
      return content;
    },
  });

  // Custom rule: handle WordPress figure/figcaption blocks
  turndown.addRule('wpFigure', {
    filter: 'figure',
    replacement(content, node) {
      const img = node.querySelector('img');
      const caption = node.querySelector('figcaption');
      if (!img) return content;

      let src = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || caption?.textContent || '';

      src = rewriteUrl(src, wpUrl);
      return `![${alt}](${src})`;
    },
  });

  // Custom rule: handle iframes (YouTube embeds, etc.) — preserve as HTML
  turndown.addRule('iframes', {
    filter: 'iframe',
    replacement(content, node) {
      const src = node.getAttribute('src') || '';
      const title = node.getAttribute('title') || '';
      if (!src) return '';
      // Keep iframes as HTML since Markdown can't represent them
      const width = node.getAttribute('width') || '560';
      const height = node.getAttribute('height') || '315';
      return `\n\n<iframe src="${src}" title="${title}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>\n\n`;
    },
  });

  return turndown;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Final pass: catch any remaining WordPress/localhost URLs in the markdown output.
 * This handles URLs that Turndown didn't process through custom rules.
 */
function rewriteRemainingUrls(markdown, wpUrl) {
  if (!markdown || !wpUrl) return markdown;
  const base = wpUrl.replace(/\/+$/, '');
  const escaped = escapeRegex(base);

  // Rewrite remaining wp-content/uploads URLs to /images/
  markdown = markdown.replace(
    new RegExp(`${escaped}/wp-content/uploads/`, 'g'),
    '/images/'
  );

  // Rewrite remaining same-origin URLs to relative paths
  markdown = markdown.replace(
    new RegExp(`${escaped}(/[^\\s)">]*)`, 'g'),
    (match, path) => path || '/'
  );

  // Handle protocol-relative and mismatched-scheme variants of the WP URL
  const baseWithoutProto = base.replace(/^https?:\/\//, '');
  const escapedNoProto = escapeRegex(baseWithoutProto);
  markdown = markdown.replace(
    new RegExp(`(?:https?:)?//${escapedNoProto}/wp-content/uploads/`, 'g'),
    '/images/'
  );
  markdown = markdown.replace(
    new RegExp(`(?:https?:)?//${escapedNoProto}(/[^\\s)">]*)`, 'g'),
    (match, path) => path || '/'
  );

  // Catch any remaining localhost URLs (DB may store URLs with different port, no port, or protocol-relative)
  markdown = markdown.replace(
    /(?:https?:)?\/\/localhost(?::\d+)?\/wp-content\/uploads\//g,
    '/images/'
  );
  markdown = markdown.replace(
    /(?:https?:)?\/\/localhost(?::\d+)?(\/[^\s)">]*)/g,
    (match, path) => path || '/'
  );

  // Catch-all: any URL containing /wp-content/uploads/ (legacy domains, theme demos, etc.)
  markdown = markdown.replace(
    /https?:\/\/[^\s)"'>]+\/wp-content\/uploads\//g,
    '/images/'
  );

  return markdown;
}

/**
 * Convert WordPress HTML content to Markdown.
 * Cleans Elementor markup, rewrites all URLs, and runs a final URL sweep.
 */
export function htmlToMarkdown(html, wpUrl) {
  if (!html) return '';
  const cleaned = cleanHtml(html);
  let markdown = getTurndown(wpUrl).turndown(cleaned);
  // Final sweep for any URLs that slipped through
  markdown = rewriteRemainingUrls(markdown, wpUrl);
  // Strip WP-generated thumbnail suffixes (e.g. image-300x200.jpg → image.jpg)
  // We download originals only; thumbnails don't exist on the static site
  markdown = stripThumbnailSuffixes(markdown);
  return markdown;
}

/**
 * Strip WordPress thumbnail size suffixes from /images/ paths.
 * Matches patterns like filename-300x200.ext → filename.ext
 * Only applies to /images/ paths (our rewritten media URLs).
 * Requires at least one dimension ≥ 100 to avoid false positives on
 * legitimate names like banner-16x9.jpg or icon-2x2.png.
 */
function stripThumbnailSuffixes(markdown) {
  return markdown.replace(
    /(\/images\/[^\s)"'>]*?)-(\d+)x(\d+)\.(jpe?g|png|gif|webp|avif)/gi,
    (match, prefix, w, h, ext) => {
      const width = parseInt(w);
      const height = parseInt(h);
      if (width >= 100 || height >= 100) {
        return `${prefix}.${ext}`;
      }
      return match;
    }
  );
}
