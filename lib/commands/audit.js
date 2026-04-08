import { query, queryScalar, phpUnserialize } from '../connect/database.js';
import { fetchAll } from '../connect/rest-api.js';

/**
 * Audit command: connect to WordPress and report content counts.
 */
export async function audit(config) {
  const prefix = config.wordpress.table_prefix;

  console.log(`Auditing WordPress at ${config.wordpress.url}`);
  console.log(`DB container: ${config.wordpress.container}\n`);

  // Test DB connection
  try {
    const version = queryScalar('SELECT VERSION()', config);
    console.log(`Database: MariaDB ${version}`);
  } catch (err) {
    throw new Error(`Cannot connect to database: ${err.message}`);
  }

  // Content counts from DB
  const counts = {};

  counts.pages = queryScalar(
    `SELECT COUNT(*) FROM ${prefix}posts WHERE post_type='page' AND post_status='publish'`, config);
  counts.posts = queryScalar(
    `SELECT COUNT(*) FROM ${prefix}posts WHERE post_type='post' AND post_status='publish'`, config);
  counts.media = queryScalar(
    `SELECT COUNT(*) FROM ${prefix}posts WHERE post_type='attachment'`, config);

  console.log('\nContent:');
  console.log(`  Pages: ${counts.pages}`);
  console.log(`  Posts: ${counts.posts}`);
  console.log(`  Media: ${counts.media}`);

  // Active plugins
  const pluginRows = query(
    `SELECT option_value FROM ${prefix}options WHERE option_name='active_plugins'`, config);
  const pluginSerialized = pluginRows[0]?.[0] || '';
  const activePlugins = phpUnserialize(pluginSerialized) || [];
  const pluginSlugs = Array.isArray(activePlugins) ? activePlugins.map(p => String(p)) : [];

  console.log(`\nActive Plugins (${pluginSlugs.length}):`);
  for (const p of pluginSlugs) {
    console.log(`  - ${p}`);
  }

  // Plugin-specific counts
  const hasTEC = pluginSlugs.some(p => p.includes('the-events-calendar'));
  const hasGF = pluginSlugs.some(p => p.includes('gravityforms'));

  if (hasTEC) {
    const events = queryScalar(
      `SELECT COUNT(DISTINCT te.event_id) FROM ${prefix}tec_events te ` +
      `JOIN ${prefix}posts p ON te.post_id = p.ID WHERE p.post_status='publish'`, config);
    const occurrences = queryScalar(
      `SELECT COUNT(*) FROM ${prefix}tec_occurrences occ ` +
      `JOIN ${prefix}tec_events te ON occ.event_id = te.event_id ` +
      `JOIN ${prefix}posts p ON te.post_id = p.ID ` +
      `WHERE p.post_status='publish' AND occ.start_date >= '2026-01-01'`, config);
    const categories = queryScalar(
      `SELECT COUNT(*) FROM ${prefix}term_taxonomy WHERE taxonomy='tribe_events_cat'`, config);

    console.log(`\nThe Events Calendar:`);
    console.log(`  Event series: ${events}`);
    console.log(`  Future occurrences (2026+): ${occurrences}`);
    console.log(`  Event categories: ${categories}`);
  }

  if (hasGF) {
    const forms = queryScalar(
      `SELECT COUNT(*) FROM ${prefix}gf_form WHERE is_active=1`, config);
    console.log(`\nGravity Forms:`);
    console.log(`  Active forms: ${forms}`);
  }

  // Test REST API
  console.log('\nREST API:');
  try {
    const pages = await fetchAll('/wp/v2/pages?per_page=1', config);
    console.log(`  Accessible: yes`);
  } catch (err) {
    console.log(`  Accessible: no (${err.message})`);
  }

  // Menus
  try {
    const menus = await fetchAll('/wp/v2/menus', config);
    console.log(`  Menus: ${menus.length}`);
  } catch {
    console.log(`  Menus: endpoint not available`);
  }

  console.log('\nAudit complete.');
}
