import { query } from '../connect/database.js';

/**
 * Extract media manifest from the database directly.
 * Avoids the REST API which exhausts PHP memory on heavy plugin stacks.
 */
export async function extractMedia(config) {
  const prefix = config.wordpress.table_prefix;

  // Get all attachments with their guid (source URL) and mime type
  const rows = query(
    `SELECT p.ID, p.post_title, p.guid, p.post_mime_type, ` +
    `  (SELECT meta_value FROM ${prefix}postmeta WHERE post_id = p.ID AND meta_key = '_wp_attachment_image_alt' LIMIT 1) AS alt_text ` +
    `FROM ${prefix}posts p ` +
    `WHERE p.post_type = 'attachment' AND p.post_status = 'inherit' ` +
    `ORDER BY p.ID`,
    config,
    { columns: ['ID', 'post_title', 'guid', 'post_mime_type', 'alt_text'] }
  );

  const wpUrl = config.wordpress.url; // e.g., http://localhost:8080

  const manifest = rows.map(row => {
    const source = row.guid || '';
    const uploadMatch = source.match(/\/wp-content\/uploads\/(.+)$/);
    const relativePath = uploadMatch ? uploadMatch[1] : '';

    // Rewrite source_url to use local WP URL for downloading
    // (guid may point to old/production domains that aren't accessible locally)
    const downloadUrl = relativePath
      ? `${wpUrl}/wp-content/uploads/${relativePath}`
      : source;

    return {
      id: parseInt(row.ID),
      title: row.post_title || '',
      alt_text: row.alt_text || '',
      mime_type: row.post_mime_type || '',
      source_url: downloadUrl,
      relative_path: relativePath,
      width: null,
      height: null,
    };
  });

  console.log(`  Media: ${manifest.length} items in manifest`);
  return { files: [], data: { 'media-manifest': manifest } };
}
