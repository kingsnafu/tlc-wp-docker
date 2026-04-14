import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { extractSiteSettings } from './site-settings.js';
import { extractPages } from './pages.js';
import { extractPosts } from './posts.js';
import { extractMenus } from './menus.js';
import { extractMedia } from './media.js';
import { extractTaxonomies } from './taxonomies.js';
import { extractPlugins } from './plugins/index.js';
import { extractCustomPostTypes } from './custom-post-types.js';
import { downloadMedia } from '../connect/media-downloader.js';
import { query } from '../connect/database.js';

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
  const frontPageId = settings.data['site-meta'].page_on_front || 0;
  console.log('\nPages:');
  const pages = await extractPages(config, { yoastMeta, mediaMap, frontPageId });

  // 5b. Author lookup
  const authorMap = {};
  try {
    const userRows = query(
      `SELECT ID, display_name FROM ${config.wordpress.table_prefix}users`,
      config,
      { columns: ['ID', 'display_name'] }
    );
    for (const r of userRows) authorMap[parseInt(r.ID)] = r.display_name;
  } catch { /* non-critical */ }

  // 6. Posts
  console.log('\nPosts:');
  const posts = await extractPosts(config, { yoastMeta, taxonomies: taxonomies.data.taxonomies, mediaMap, authorMap });

  // 7. Custom Post Types (generic — anything not already handled)
  console.log('\nCustom Post Types:');
  const cpts = await extractCustomPostTypes(config, { yoastMeta, mediaMap, authorMap });

  // 8. Menus
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
    ...cpts.files,
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
    ...cpts.data,
    ...menus.data,
    ...media.data,
  };

  for (const [name, data] of Object.entries(allData)) {
    const fullPath = join(outputDir, 'data', `${name}.json`);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
  }

  // Generate Eleventy scaffolding for discovered CPTs
  for (const cpt of cpts.discovered) {
    scaffoldCpt(cpt.slug, cpt.name, outputDir);
  }

  // Download media files
  console.log('\nDownloading media:');
  const manifest = media.data['media-manifest'] || [];
  await downloadMedia(manifest, outputDir);

  // Log skipped (non-published) content for transparency
  const prefix = config.wordpress.table_prefix;
  const trackedTypes = ['page', 'post', ...cpts.discovered.map(c => c.slug)];
  const typeList = trackedTypes.map(t => `'${t}'`).join(',');
  try {
    const skippedRows = query(
      `SELECT post_type, post_status, COUNT(*) AS cnt FROM ${prefix}posts ` +
      `WHERE post_type IN (${typeList}) AND post_status NOT IN ('publish','inherit','auto-draft','trash') ` +
      `GROUP BY post_type, post_status ORDER BY post_type, post_status`,
      config,
      { columns: ['post_type', 'post_status', 'cnt'] }
    );
    if (skippedRows.length) {
      console.log('\nSkipped (non-published):');
      for (const r of skippedRows) {
        console.log(`  ${r.post_type} — ${r.post_status}: ${r.cnt}`);
      }
    }
  } catch { /* non-critical */ }

  // Summary
  console.log(`\nExtraction complete:`);
  console.log(`  ${allFiles.length} content files`);
  console.log(`  ${Object.keys(allData).length} data files`);
  console.log(`  ${manifest.length} media items`);
  if (cpts.discovered.length) {
    console.log(`  ${cpts.discovered.length} custom post types: ${cpts.discovered.map(c => `${c.name} (${c.count})`).join(', ')}`);
  }
}

/**
 * Generate Eleventy data loader and paginated template for a custom post type.
 * Only writes if the files don't already exist (won't overwrite customized templates).
 */
function scaffoldCpt(slug, label, projectDir) {
  // Data loader: src/_data/{slug}.js — reads from content/{slug}/*.md
  const dataLoaderPath = join(projectDir, 'src', '_data', `${slug}.js`);
  if (!existsSync(dataLoaderPath)) {
    mkdirSync(dirname(dataLoaderPath), { recursive: true });
    writeFileSync(dataLoaderPath, `import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import matter from 'gray-matter';

export default function() {
  const dir = resolve(process.cwd(), 'content', '${slug}');
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.md'));
    return files.map(f => {
      const raw = readFileSync(join(dir, f), 'utf8');
      const { data, content } = matter(raw);
      if (data.date && typeof data.date === 'string') data.date = new Date(data.date);
      return { ...data, content, fileName: f };
    }).sort((a, b) => (b.date || 0) - (a.date || 0));
  } catch {
    return [];
  }
}
`, 'utf8');
  }

  // Paginated template: src/{slug}/{slug}.njk
  const templateDir = join(projectDir, 'src', slug);
  const templatePath = join(templateDir, `${slug}.njk`);
  if (!existsSync(templatePath)) {
    mkdirSync(templateDir, { recursive: true });
    writeFileSync(templatePath, `---
pagination:
  data: ${slug}
  size: 1
  alias: item
permalink: "/${slug}/{{ item.slug }}/index.html"
eleventyComputed:
  title: "{{ item.title | safe }}"
  seo_description: "{{ item.seo_description | safe }}"
layout: base.njk
---
<article class="cpt-${slug}">
  <header>
    <h1>{{ item.title }}</h1>
    {% if item.date %}<p class="post-meta"><time datetime="{{ item.date | dateFormat }}">{{ item.date | dateFormat("long") }}</time></p>{% endif %}
  </header>
  {% if item.featured_image %}
  <img src="/images/{{ item.featured_image }}" alt="{{ item.title | e }}" class="featured-image">
  {% endif %}
  {{ item.content | markdown | safe }}
</article>
`, 'utf8');
  }
}
