import { fetchAll } from '../connect/rest-api.js';

export async function extractTaxonomies(config) {
  let categories = [];
  let tags = [];

  try {
    categories = await fetchAll('/wp/v2/categories?per_page=100', config);
  } catch {
    console.log('  Categories: fetch failed');
  }

  try {
    tags = await fetchAll('/wp/v2/tags?per_page=100', config);
  } catch {
    console.log('  Tags: fetch failed');
  }

  const data = {
    taxonomies: {
      categories: categories.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description || '',
        parent: c.parent || 0,
        count: c.count || 0,
      })),
      tags: tags.map(t => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description || '',
        count: t.count || 0,
      })),
    },
  };

  console.log(`  Categories: ${categories.length}, Tags: ${tags.length}`);
  return { files: [], data };
}
