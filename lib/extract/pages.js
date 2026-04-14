import { fetchAll } from '../connect/rest-api.js';
import { htmlToMarkdown } from '../transform/html-to-markdown.js';
import { decodeHtmlEntities } from '../transform/clean-content.js';

export async function extractPages(config, { yoastMeta = {}, mediaMap = {}, frontPageId = 0 } = {}) {
  const pages = await fetchAll('/wp/v2/pages?per_page=100&status=publish', config);
  const wpUrl = config.wordpress.url;
  const files = [];

  for (const page of pages) {
    const slug = page.slug || `page-${page.id}`;
    const content = htmlToMarkdown(page.content?.rendered || '', wpUrl);
    const yoast = yoastMeta[page.id] || {};

    const frontMatter = {
      title: decodeHtmlEntities(page.title?.rendered) || '',
      slug,
      date: page.date,
      modified: page.modified,
      template: page.template || 'page',
      parent: page.parent || 0,
      menu_order: page.menu_order || 0,
    };

    if (page.featured_media && mediaMap[page.featured_media]) {
      frontMatter.featured_image = mediaMap[page.featured_media];
    }
    if (yoast.title) frontMatter.seo_title = yoast.title;
    if (yoast.description) frontMatter.seo_description = yoast.description;
    if (frontPageId && page.id === frontPageId) frontMatter.is_front_page = true;

    const md = buildMarkdown(frontMatter, content);
    files.push({ path: `content/pages/${slug}.md`, content: md });
  }

  console.log(`  Pages: ${files.length}`);
  return { files, data: {} };
}

function buildMarkdown(frontMatter, content) {
  const yaml = Object.entries(frontMatter)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return `---\n${yaml}\n---\n\n${content}\n`;
}
