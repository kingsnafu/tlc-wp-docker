import TurndownService from 'turndown';
import { cleanHtml } from './clean-content.js';

let turndown;

function getTurndown(wpUrl) {
  if (turndown) return turndown;

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

      // Rewrite WordPress upload URLs to local image paths
      if (wpUrl) {
        src = src.replace(new RegExp(`^${escapeRegex(wpUrl)}/wp-content/uploads/`), '/images/');
      }
      // Also handle relative /wp-content/uploads/ paths
      src = src.replace(/^\/wp-content\/uploads\//, '/images/');

      return src ? `![${alt}](${src})` : '';
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

      if (wpUrl) {
        src = src.replace(new RegExp(`^${escapeRegex(wpUrl)}/wp-content/uploads/`), '/images/');
      }
      src = src.replace(/^\/wp-content\/uploads\//, '/images/');

      return `![${alt}](${src})`;
    },
  });

  return turndown;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert WordPress HTML content to Markdown.
 * Cleans Elementor markup and rewrites image URLs.
 */
export function htmlToMarkdown(html, wpUrl) {
  if (!html) return '';
  const cleaned = cleanHtml(html);
  return getTurndown(wpUrl).turndown(cleaned);
}
