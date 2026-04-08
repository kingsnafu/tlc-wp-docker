import { fetchAll } from '../connect/rest-api.js';
import { htmlToMarkdown } from '../transform/html-to-markdown.js';

export async function extractPosts(config, { yoastMeta = {}, taxonomies = {} } = {}) {
  const posts = await fetchAll('/wp/v2/posts?per_page=100&status=publish', config);
  const wpUrl = config.wordpress.url;
  const files = [];

  // Build lookup maps for categories and tags
  const catMap = {};
  const tagMap = {};
  for (const cat of (taxonomies.categories || [])) {
    catMap[cat.id] = cat.slug;
  }
  for (const tag of (taxonomies.tags || [])) {
    tagMap[tag.id] = tag.slug;
  }

  for (const post of posts) {
    const slug = post.slug || `post-${post.id}`;
    const datePrefix = (post.date || '').slice(0, 10);
    const content = htmlToMarkdown(post.content?.rendered || '', wpUrl);
    const yoast = yoastMeta[post.id] || {};

    const categories = (post.categories || []).map(id => catMap[id]).filter(Boolean);
    const tags = (post.tags || []).map(id => tagMap[id]).filter(Boolean);

    const frontMatter = {
      title: post.title?.rendered || '',
      slug,
      date: post.date,
      modified: post.modified,
      author: post.author,
      excerpt: post.excerpt?.rendered?.replace(/<[^>]+>/g, '').trim() || '',
    };

    if (categories.length) frontMatter.categories = categories;
    if (tags.length) frontMatter.tags = tags;
    if (post.featured_media) frontMatter.featured_image = post.featured_media;
    if (yoast.title) frontMatter.seo_title = yoast.title;
    if (yoast.description) frontMatter.seo_description = yoast.description;

    const md = buildMarkdown(frontMatter, content);
    files.push({ path: `content/posts/${datePrefix}-${slug}.md`, content: md });
  }

  console.log(`  Posts: ${files.length}`);
  return { files, data: {} };
}

function buildMarkdown(frontMatter, content) {
  const lines = [];
  for (const [k, v] of Object.entries(frontMatter)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${JSON.stringify(item)}`);
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  return `---\n${lines.join('\n')}\n---\n\n${content}\n`;
}
