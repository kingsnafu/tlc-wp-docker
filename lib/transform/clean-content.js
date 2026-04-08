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

export function cleanHtml(html) {
  if (!html) return '';

  let cleaned = html;

  // Remove style blocks
  cleaned = cleaned.replace(STYLE_BLOCK_RE, '');

  // Remove Elementor comments
  cleaned = cleaned.replace(ELEMENTOR_COMMENT_RE, '');

  // Remove data attributes
  cleaned = cleaned.replace(DATA_ATTR_RE, '');

  // Remove empty Elementor wrapper divs
  cleaned = cleaned.replace(EMPTY_WRAPPER_RE, '');

  // Strip shortcodes (keep content between opening/closing tags)
  cleaned = cleaned.replace(SHORTCODE_RE, '');

  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}
