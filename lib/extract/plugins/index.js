import { extractTecEvents } from './tec-events.js';
import { extractGravityForms } from './gravity-forms.js';
import { extractYoast } from './yoast.js';

const PLUGIN_MAP = {
  tec_events: extractTecEvents,
  gravity_forms: extractGravityForms,
  yoast: extractYoast,
};

/**
 * Run enabled plugin extractors.
 * Returns combined { files, data } from all plugins, plus yoastMeta for page/post enrichment.
 */
export async function extractPlugins(config, detectedPlugins) {
  const overrides = config.plugins || {};
  const files = [];
  const data = {};
  let yoastMeta = {};

  for (const [key, extractFn] of Object.entries(PLUGIN_MAP)) {
    const enabled = overrides[key] ?? detectedPlugins[key] ?? false;
    if (!enabled) continue;

    try {
      const result = await extractFn(config);
      files.push(...(result.files || []));
      Object.assign(data, result.data || {});

      // Yoast returns meta keyed by post_id for enrichment
      if (key === 'yoast' && result.yoastMeta) {
        yoastMeta = result.yoastMeta;
      }
    } catch (err) {
      console.warn(`  Warning: ${key} extraction failed: ${err.message}`);
    }
  }

  return { files, data, yoastMeta };
}
