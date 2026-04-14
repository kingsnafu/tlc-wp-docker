/**
 * Pre-Turndown HTML cleaning.
 * Strips Elementor markup, empty wrappers, inline styles, and shortcodes.
 */

// Remove Elementor data attributes
const DATA_ATTR_RE = /\s+data-(?:elementor|widget|element|settings|id|motion-effects)[^\s=>]*(?:="[^"]*")?/gi;

// Remove <style> blocks
const STYLE_BLOCK_RE = /<style[^>]*>[\s\S]*?<\/style>/gi;

// Remove Elementor comment markers
const ELEMENTOR_COMMENT_RE = /<!--\s*(?:wp:elementor|\/wp:elementor|elementor)[^>]*-->/gi;

// Remove empty wrapper divs (Elementor section/column/widget wrappers)
const EMPTY_WRAPPER_RE = /<div[^>]*class="[^"]*(?:elementor-(?:section|column|widget|element|container|inner))[^"]*"[^>]*>\s*<\/div>/gi;

// Strip shortcodes — [shortcode attr="val"]...[/shortcode] or [shortcode /]
const SHORTCODE_RE = /\[(\/?)[a-zA-Z_][a-zA-Z0-9_-]*(?:\s[^\]]*?)?\/?]/g;

/**
 * Decode HTML entities in text (titles, excerpts, menu labels).
 * Handles named entities common in WP REST API output and numeric refs.
 */
const HTML_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&nbsp;': ' ', '&mdash;': '\u2014', '&ndash;': '\u2013',
  '&laquo;': '\u00AB', '&raquo;': '\u00BB',
  '&lsquo;': '\u2018', '&rsquo;': '\u2019',
  '&ldquo;': '\u201C', '&rdquo;': '\u201D',
  '&hellip;': '\u2026', '&trade;': '\u2122',
  '&copy;': '\u00A9', '&reg;': '\u00AE',
};

export function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&[a-zA-Z]+;/g, (m) => HTML_ENTITIES[m] ?? m)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

// Remove <script> blocks (RevSlider, inline JS, etc.)
const SCRIPT_BLOCK_RE = /<script[^>]*>[\s\S]*?<\/script>/gi;

// Remove JSON-LD schema blocks (TEC events inject these)
const JSONLD_RE = /\[?\{"@context":"http:\/\/schema\.org"[\s\S]*?\}\]?/g;

// Remove TEC view state JSON blobs (shortcode output remnants)
const TEC_VIEW_STATE_RE = /\{"slug":"(?:list|month|day)"[\s\S]*?"classes":\[[\s\S]*?\]\}/g;

// Remove WP block comments <!-- wp:something --> and <!-- /wp:something -->
const WP_BLOCK_COMMENT_RE = /<!--\s*\/?wp:[a-z][a-z0-9\/-]*(?:\s+\{[^}]*\})?\s*-->/gi;

export function cleanHtml(html) {
  if (!html) return '';

  let cleaned = html;

  // Remove script blocks (must be before other cleaning)
  cleaned = cleaned.replace(SCRIPT_BLOCK_RE, '');

  // Remove style blocks
  cleaned = cleaned.replace(STYLE_BLOCK_RE, '');

  // Remove Elementor comments
  cleaned = cleaned.replace(ELEMENTOR_COMMENT_RE, '');

  // Remove WP block comments
  cleaned = cleaned.replace(WP_BLOCK_COMMENT_RE, '');

  // Remove data attributes
  cleaned = cleaned.replace(DATA_ATTR_RE, '');

  // Remove empty Elementor wrapper divs
  cleaned = cleaned.replace(EMPTY_WRAPPER_RE, '');

  // Strip shortcodes (keep content between opening/closing tags)
  cleaned = cleaned.replace(SHORTCODE_RE, '');

  // Remove JSON-LD schema and TEC view state blobs
  cleaned = cleaned.replace(JSONLD_RE, '');
  cleaned = cleaned.replace(TEC_VIEW_STATE_RE, '');

  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}
