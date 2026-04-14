import { fetchAll } from '../connect/rest-api.js';
import { query } from '../connect/database.js';
import { decodeHtmlEntities } from '../transform/clean-content.js';
import { rewriteUrl } from '../transform/html-to-markdown.js';

export async function extractMenus(config) {
  const wpUrl = config.wordpress.url;

  // Try REST API first, fall back to DB
  let menus;
  try {
    menus = await fetchAll('/wp/v2/menus', config);
  } catch {
    return extractMenusFromDb(config, wpUrl);
  }

  const result = [];

  for (const menu of menus) {
    let items;
    try {
      items = await fetchAll(`/wp/v2/menu-items?menus=${menu.id}&per_page=100`, config);
    } catch {
      items = [];
    }

    result.push(buildMenu(
      { id: menu.id, name: menu.name || menu.slug || '', slug: menu.slug || '' },
      items.map(item => ({
        id: item.id,
        title: decodeHtmlEntities(item.title?.rendered) || '',
        url: rewriteUrl(item.url || '', wpUrl),
        target: item.target || '',
        parent: item.parent || 0,
        order: item.menu_order || 0,
      }))
    ));
  }

  console.log(`  Menus: ${result.length}`);
  return { files: [], data: { menus: result } };
}

/**
 * Extract menus directly from the database when the REST API endpoint is unavailable.
 */
function extractMenusFromDb(config, wpUrl) {
  const prefix = config.wordpress.table_prefix;

  // Get all nav menus
  const menuRows = query(
    `SELECT t.term_id, t.name, t.slug FROM ${prefix}terms t ` +
    `JOIN ${prefix}term_taxonomy tt ON t.term_id = tt.term_id ` +
    `WHERE tt.taxonomy = 'nav_menu'`,
    config,
    { columns: ['term_id', 'name', 'slug'] }
  );

  if (!menuRows.length) {
    console.log('  Menus: 0');
    return { files: [], data: { menus: [] } };
  }

  // Get all menu items with their meta in one query
  const itemRows = query(
    `SELECT t.term_id AS menu_id, p.ID, p.post_title, p.menu_order, ` +
    `  MAX(CASE WHEN pm.meta_key = '_menu_item_type' THEN pm.meta_value END) AS item_type, ` +
    `  MAX(CASE WHEN pm.meta_key = '_menu_item_object_id' THEN pm.meta_value END) AS object_id, ` +
    `  MAX(CASE WHEN pm.meta_key = '_menu_item_url' THEN pm.meta_value END) AS item_url, ` +
    `  MAX(CASE WHEN pm.meta_key = '_menu_item_menu_item_parent' THEN pm.meta_value END) AS parent_id, ` +
    `  MAX(CASE WHEN pm.meta_key = '_menu_item_target' THEN pm.meta_value END) AS target ` +
    `FROM ${prefix}posts p ` +
    `JOIN ${prefix}postmeta pm ON p.ID = pm.post_id ` +
    `JOIN ${prefix}term_relationships tr ON p.ID = tr.object_id ` +
    `JOIN ${prefix}term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id ` +
    `JOIN ${prefix}terms t ON tt.term_id = t.term_id ` +
    `WHERE p.post_type = 'nav_menu_item' AND tt.taxonomy = 'nav_menu' ` +
    `GROUP BY t.term_id, p.ID, p.post_title, p.menu_order ` +
    `ORDER BY t.term_id, p.menu_order`,
    config,
    { columns: ['menu_id', 'ID', 'post_title', 'menu_order', 'item_type', 'object_id', 'item_url', 'parent_id', 'target'] }
  );

  // Resolve page/post titles for items with empty post_title (type=post_type)
  const objectIds = [...new Set(
    itemRows.filter(r => r.item_type === 'post_type' && r.object_id).map(r => r.object_id)
  )];
  const titleMap = {};
  if (objectIds.length) {
    const titleRows = query(
      `SELECT ID, post_title, post_name FROM ${prefix}posts WHERE ID IN (${objectIds.join(',')})`,
      config,
      { columns: ['ID', 'post_title', 'post_name'] }
    );
    for (const r of titleRows) {
      titleMap[r.ID] = { title: r.post_title, slug: r.post_name };
    }
  }

  // Group items by menu and resolve URLs/titles
  const itemsByMenu = {};
  for (const r of itemRows) {
    if (!itemsByMenu[r.menu_id]) itemsByMenu[r.menu_id] = [];

    let url = '';
    let title = decodeHtmlEntities(r.post_title) || '';

    if (r.item_type === 'custom') {
      url = r.item_url || '';
    } else if (r.item_type === 'post_type' && r.object_id) {
      const linked = titleMap[r.object_id];
      if (linked) {
        url = `/${linked.slug}/`;
        if (!title) title = decodeHtmlEntities(linked.title) || '';
      }
    }

    itemsByMenu[r.menu_id].push({
      id: parseInt(r.ID),
      title,
      url: rewriteUrl(url, wpUrl),
      target: r.target || '',
      parent: parseInt(r.parent_id) || 0,
      order: parseInt(r.menu_order) || 0,
    });
  }

  const result = menuRows.map(menu => buildMenu(
    { id: parseInt(menu.term_id), name: menu.name, slug: menu.slug },
    itemsByMenu[menu.term_id] || []
  ));

  console.log(`  Menus: ${result.length} (from database)`);
  return { files: [], data: { menus: result } };
}

/**
 * Build a hierarchical menu from flat items list.
 */
function buildMenu(menu, items) {
  const itemMap = new Map();
  const topLevel = [];

  for (const item of items) {
    itemMap.set(item.id, { ...item, children: [] });
  }

  for (const entry of itemMap.values()) {
    if (entry.parent && itemMap.has(entry.parent)) {
      itemMap.get(entry.parent).children.push(entry);
    } else {
      topLevel.push(entry);
    }
  }

  const sortItems = (list) => {
    list.sort((a, b) => a.order - b.order);
    for (const item of list) sortItems(item.children);
  };
  sortItems(topLevel);

  return { id: menu.id, name: menu.name, slug: menu.slug, items: topLevel };
}

