import { query } from '../../connect/database.js';

/**
 * Extract Yoast SEO metadata from wp_postmeta.
 * Returns a lookup table keyed by post_id for enriching pages/posts.
 */
export async function extractYoast(config) {
  const prefix = config.wordpress.table_prefix;

  const rows = query(
    `SELECT post_id, meta_key, meta_value FROM ${prefix}postmeta ` +
    `WHERE meta_key LIKE '_yoast_wpseo_%' ` +
    `AND meta_value != '' AND meta_value IS NOT NULL`,
    config,
    { columns: ['post_id', 'meta_key', 'meta_value'] }
  );

  const yoastMeta = {};

  for (const row of rows) {
    const pid = parseInt(row.post_id);
    if (!yoastMeta[pid]) yoastMeta[pid] = {};

    const key = row.meta_key.replace('_yoast_wpseo_', '');
    yoastMeta[pid][key] = row.meta_value;
  }

  // Normalize to the fields we care about
  const normalized = {};
  for (const [pid, data] of Object.entries(yoastMeta)) {
    normalized[pid] = {
      title: data.title || '',
      description: data.metadesc || '',
      canonical: data.canonical || '',
      no_index: data['meta-robots-noindex'] === '1',
      og_title: data.opengraph_title || '',
      og_description: data.opengraph_description || '',
      og_image: data.opengraph_image || '',
    };
  }

  console.log(`  Yoast SEO: ${Object.keys(normalized).length} posts with metadata`);
  return { files: [], data: {}, yoastMeta: normalized };
}
