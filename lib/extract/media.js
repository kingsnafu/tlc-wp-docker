import { fetchAll } from '../connect/rest-api.js';

export async function extractMedia(config) {
  const media = await fetchAll('/wp/v2/media?per_page=100', config);

  const manifest = media.map(item => {
    const source = item.source_url || item.guid?.rendered || '';
    // Extract relative path from full URL
    const uploadMatch = source.match(/\/wp-content\/uploads\/(.+)$/);
    const relativePath = uploadMatch ? uploadMatch[1] : '';

    return {
      id: item.id,
      title: item.title?.rendered || '',
      alt_text: item.alt_text || '',
      mime_type: item.mime_type || '',
      source_url: source,
      relative_path: relativePath,
      width: item.media_details?.width || null,
      height: item.media_details?.height || null,
    };
  });

  console.log(`  Media: ${manifest.length} items in manifest`);
  return { files: [], data: { 'media-manifest': manifest } };
}
