import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { extractSiteSettings } from './site-settings.js';
import { extractPages } from './pages.js';
import { extractPosts } from './posts.js';
import { extractMenus } from './menus.js';
import { extractMedia } from './media.js';
import { extractTaxonomies } from './taxonomies.js';
import { extractPlugins } from './plugins/index.js';
import { downloadMedia } from '../connect/media-downloader.js';

/**
 * Run all extractors and write output to content/, data/, images/ directories.
 */
export async function extract(config) {
  const outputDir = process.cwd();

  console.log('Extracting content from WordPress...\n');

  // 1. Site settings + plugin detection
  console.log('Site settings:');
  const settings = await extractSiteSettings(config);
  const detected = settings.data['site-meta'].detected_plugins;
  console.log(`  Detected plugins: ${Object.entries(detected).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none'}`);

  // 2. Taxonomies (needed for post category/tag resolution)
  console.log('\nTaxonomies:');
  const taxonomies = await extractTaxonomies(config);

  // 3. Media manifest (needed for featured image resolution in pages/posts/events)
  console.log('\nMedia:');
  const media = await extractMedia(config);
  const mediaMap = {};
  for (const item of (media.data['media-manifest'] || [])) {
    if (item.id && item.relative_path) mediaMap[item.id] = item.relative_path;
  }

  // 4. Plugin extractors (after media so TEC can resolve images via mediaMap)
  console.log('\nPlugin data:');
  const plugins = await extractPlugins(config, detected, { mediaMap });
  const yoastMeta = plugins.yoastMeta || {};

  // 5. Pages
  console.log('\nPages:');
  const pages = await extractPages(config, { yoastMeta, mediaMap });

  // 6. Posts
  console.log('\nPosts:');
  const posts = await extractPosts(config, { yoastMeta, taxonomies: taxonomies.data.taxonomies, mediaMap });

  // 7. Menus
  console.log('\nMenus:');
  const menus = await extractMenus(config);

  // Write all files
  console.log('\nWriting files...');
  const allFiles = [
    ...settings.files,
    ...plugins.files,
    ...taxonomies.files,
    ...pages.files,
    ...posts.files,
    ...menus.files,
    ...media.files,
  ];

  for (const file of allFiles) {
    const fullPath = join(outputDir, file.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, 'utf8');
  }

  // Write data JSON files
  const allData = {
    ...settings.data,
    ...plugins.data,
    ...taxonomies.data,
    ...menus.data,
    ...media.data,
  };

  for (const [name, data] of Object.entries(allData)) {
    const fullPath = join(outputDir, 'data', `${name}.json`);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
  }

  // Download media files
  console.log('\nDownloading media:');
  const manifest = media.data['media-manifest'] || [];
  await downloadMedia(manifest, outputDir);

  // Summary
  console.log(`\nExtraction complete:`);
  console.log(`  ${allFiles.length} content files`);
  console.log(`  ${Object.keys(allData).length} data files`);
  console.log(`  ${manifest.length} media items`);
}
