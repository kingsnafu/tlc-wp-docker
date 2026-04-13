import { fetchAll } from '../connect/rest-api.js';
import { decodeHtmlEntities } from '../transform/clean-content.js';

export async function extractMenus(config) {
  const wpUrl = config.wordpress.url; // trailing slash already stripped by config.js

  let menus;
  try {
    menus = await fetchAll('/wp/v2/menus', config);
  } catch {
    console.log('  Menus: 0 (menu endpoint not available — install WP REST API Menus plugin or use nav_menu_locations)');
    return { files: [], data: { menus: [] } };
  }

  const result = [];

  for (const menu of menus) {
    let items;
    try {
      items = await fetchAll(`/wp/v2/menu-items?menus=${menu.id}&per_page=100`, config);
    } catch {
      items = [];
    }

    // Build hierarchical structure
    const itemMap = new Map();
    const topLevel = [];

    for (const item of items) {
      const entry = {
        id: item.id,
        title: decodeHtmlEntities(item.title?.rendered) || '',
        url: rewriteUrl(item.url || '', wpUrl),
        target: item.target || '',
        parent: item.parent || 0,
        order: item.menu_order || 0,
        children: [],
      };
      itemMap.set(item.id, entry);
    }

    for (const entry of itemMap.values()) {
      if (entry.parent && itemMap.has(entry.parent)) {
        itemMap.get(entry.parent).children.push(entry);
      } else {
        topLevel.push(entry);
      }
    }

    // Sort by menu_order
    const sortItems = (items) => {
      items.sort((a, b) => a.order - b.order);
      for (const item of items) sortItems(item.children);
    };
    sortItems(topLevel);

    result.push({
      id: menu.id,
      name: menu.name || menu.slug || '',
      slug: menu.slug || '',
      items: topLevel,
    });
  }

  console.log(`  Menus: ${result.length}`);
  return { files: [], data: { menus: result } };
}

/**
 * Convert absolute WordPress URLs to site-relative paths.
 * External URLs (different origin) are left unchanged.
 */
function rewriteUrl(url, wpUrl) {
  if (!url) return url;
  if (url.startsWith(wpUrl)) {
    return url.slice(wpUrl.length) || '/';
  }
  // Also handle protocol-relative or mismatched http/https
  const wpWithoutProto = wpUrl.replace(/^https?:\/\//, '');
  const urlWithoutProto = url.replace(/^https?:\/\//, '');
  if (urlWithoutProto.startsWith(wpWithoutProto)) {
    return urlWithoutProto.slice(wpWithoutProto.length) || '/';
  }
  return url;
}
