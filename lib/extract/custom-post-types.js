import { fetchOne, fetchAll } from '../connect/rest-api.js';
import { htmlToMarkdown } from '../transform/html-to-markdown.js';
import { decodeHtmlEntities } from '../transform/clean-content.js';

/**
 * Built-in and already-handled post types that should never be extracted
 * by the generic CPT extractor.
 */
const SKIP_TYPES = new Set([
  'post',
  'page',
  'attachment',
  'revision',
  'nav_menu_item',
  'custom_css',
  'customize_changeset',
  'oembed_cache',
  'user_request',
  'wp_block',
  'wp_template',
  'wp_template_part',
  'wp_global_styles',
  'wp_navigation',
  'wp_font_family',
  'wp_font_face',
  'wp_pattern',
  // TEC types — handled by dedicated plugin extractor
  'tribe_events',
  'tribe_venue',
  'tribe_organizer',
  // Gravity Forms entries
  'gf_entry',
  // WooCommerce (would need its own dedicated extractor)
  'product',
  'product_variation',
  'shop_order',
  'shop_coupon',
]);

/**
 * Discover and extract all custom post types that are registered in
 * the WordPress REST API but not handled by dedicated extractors.
 *
 * Returns { files, data, discovered } where:
 *  - files: markdown content files for each CPT item
 *  - data: JSON data keyed by CPT slug for Eleventy global data
 *  - discovered: array of { slug, name, count } for logging
 */
export async function extractCustomPostTypes(config, { yoastMeta = {}, mediaMap = {}, authorMap = {} } = {}) {
  const wpUrl = config.wordpress.url;
  const files = [];
  const data = {};
  const discovered = [];

  // Step 1: Discover registered post types via REST API
  let types;
  try {
    types = await fetchOne('/wp/v2/types', config);
  } catch (err) {
    console.log(`  CPT discovery failed (${err.message}) — skipping`);
    return { files, data, discovered };
  }

  // Step 2: Filter to extractable CPTs
  const cptSlugs = Object.keys(types).filter(slug => {
    if (SKIP_TYPES.has(slug)) return false;
    const type = types[slug];
    // Must have a REST base (i.e. show_in_rest is true)
    if (!type.rest_base && !type.rest_namespace) return false;
    return true;
  });

  if (!cptSlugs.length) {
    return { files, data, discovered };
  }

  // Step 3: Extract each CPT
  for (const slug of cptSlugs) {
    const type = types[slug];
    const restBase = type.rest_base || slug;
    const label = type.name || slug;

    let items;
    try {
      items = await fetchAll(`/wp/v2/${restBase}?per_page=100&status=publish`, config);
    } catch (err) {
      console.log(`  ${label}: failed (${err.message})`);
      continue;
    }

    if (!items.length) {
      console.log(`  ${label}: 0`);
      continue;
    }

    const cptFiles = [];
    const cptData = [];

    for (const item of items) {
      const itemSlug = item.slug || `${slug}-${item.id}`;
      const datePrefix = (item.date || '').slice(0, 10);
      const content = htmlToMarkdown(item.content?.rendered || '', wpUrl);
      const yoast = yoastMeta[item.id] || {};

      const frontMatter = {
        title: decodeHtmlEntities(item.title?.rendered) || '',
        slug: itemSlug,
        date: item.date || null,
        modified: item.modified || null,
        post_type: slug,
      };

      // Author (if present)
      if (item.author) {
        frontMatter.author = authorMap[item.author] || `User ${item.author}`;
      }

      // Excerpt (if present)
      if (item.excerpt?.rendered) {
        const excerpt = decodeHtmlEntities(item.excerpt.rendered.replace(/<[^>]+>/g, '').trim());
        if (excerpt) frontMatter.excerpt = excerpt;
      }

      // Featured image
      if (item.featured_media && mediaMap[item.featured_media]) {
        frontMatter.featured_image = mediaMap[item.featured_media];
      }

      // Yoast SEO
      if (yoast.title) frontMatter.seo_title = yoast.title;
      if (yoast.description) frontMatter.seo_description = yoast.description;

      // Preserve any custom meta fields exposed by the REST API
      if (item.meta && typeof item.meta === 'object' && Object.keys(item.meta).length) {
        frontMatter.meta = item.meta;
      }

      const md = buildMarkdown(frontMatter, content);
      const fileName = datePrefix ? `${datePrefix}-${itemSlug}.md` : `${itemSlug}.md`;
      cptFiles.push({ path: `content/${slug}/${fileName}`, content: md });

      // Also build data array entry for Eleventy global data
      cptData.push({ ...frontMatter, content });
    }

    files.push(...cptFiles);
    data[slug] = cptData;
    discovered.push({ slug, name: label, count: items.length });
    console.log(`  ${label}: ${items.length}`);
  }

  return { files, data, discovered };
}

function buildMarkdown(frontMatter, content) {
  const lines = [];
  for (const [k, v] of Object.entries(frontMatter)) {
    if (v === undefined || v === null || v === '') continue;
    if (v === false) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0) continue;

    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${JSON.stringify(item)}`);
    } else if (typeof v === 'object' && v !== null) {
      lines.push(...serializeObject(k, v, 1));
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  return `---\n${lines.join('\n')}\n---\n\n${content}\n`;
}

/**
 * Recursively serialize a nested object into YAML-style indented lines.
 * Handles objects, arrays, and scalar values at any depth.
 */
function serializeObject(key, obj, depth) {
  const indent = '  '.repeat(depth);
  const lines = [`${'  '.repeat(depth - 1)}${key}:`];

  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      lines.push(...serializeObject(k, v, depth + 1));
    } else if (Array.isArray(v)) {
      lines.push(`${indent}${k}:`);
      for (const item of v) {
        if (typeof item === 'object' && item !== null) {
          lines.push(`${indent}  - ${JSON.stringify(item)}`);
        } else {
          lines.push(`${indent}  - ${JSON.stringify(item)}`);
        }
      }
    } else {
      lines.push(`${indent}${k}: ${JSON.stringify(v)}`);
    }
  }
  return lines;
}
