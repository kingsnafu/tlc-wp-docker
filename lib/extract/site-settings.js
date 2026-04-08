import { fetchOne } from '../connect/rest-api.js';
import { query, phpUnserialize } from '../connect/database.js';

export async function extractSiteSettings(config) {
  const prefix = config.wordpress.table_prefix;

  // Get basic site settings from REST API
  let settings = {};
  try {
    settings = await fetchOne('/wp/v2/settings', config);
  } catch {
    // Settings endpoint may require auth — fall back to DB
    const rows = query(
      `SELECT option_name, option_value FROM ${prefix}options ` +
      `WHERE option_name IN ('blogname','blogdescription','siteurl','home')`,
      config,
      { columns: ['option_name', 'option_value'] }
    );
    for (const row of rows) {
      settings[row.option_name] = row.option_value;
    }
  }

  // Get active plugins from DB
  const pluginRows = query(
    `SELECT option_value FROM ${prefix}options WHERE option_name = 'active_plugins'`,
    config
  );
  const pluginSerialized = pluginRows[0]?.[0] || '';
  const activePlugins = phpUnserialize(pluginSerialized) || [];

  // Detect known plugins
  const pluginSlugs = Array.isArray(activePlugins) ? activePlugins.map(p => String(p)) : [];
  const detected = {
    tec_events: pluginSlugs.some(p => p.includes('the-events-calendar')),
    gravity_forms: pluginSlugs.some(p => p.includes('gravityforms')),
    yoast: pluginSlugs.some(p => p.includes('wordpress-seo')),
    elementor: pluginSlugs.some(p => p.includes('elementor')),
  };

  return {
    files: [],
    data: {
      'site-meta': {
        name: settings.blogname || settings.title || config.site?.name || '',
        description: settings.blogdescription || settings.description || '',
        url: settings.home || settings.url || config.site?.url || '',
        active_plugins: pluginSlugs,
        detected_plugins: detected,
      },
    },
  };
}
