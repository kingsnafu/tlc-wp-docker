import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Validate command: scan _site/ output for quality issues.
 * Catches localhost URLs, broken image refs, WP artifacts, etc.
 */
export function validate(config) {
  const siteDir = join(process.cwd(), '_site');

  if (!existsSync(siteDir)) {
    throw new Error('No _site/ directory found. Run "wp-to-static build" first.');
  }

  const wpUrl = config.wordpress.url.replace(/\/+$/, '');
  const wpHost = wpUrl.replace(/^https?:\/\//, '');

  console.log(`Validating build output in _site/\n`);

  const htmlFiles = walkDir(siteDir, /\.html?$/i);
  const imageFiles = new Set(
    walkDir(siteDir, null)
      .filter(f => /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(f))
      .map(f => '/' + relative(siteDir, f).replace(/\\/g, '/'))
  );

  const issues = { errors: [], warnings: [] };

  for (const file of htmlFiles) {
    const rel = relative(siteDir, file).replace(/\\/g, '/');
    const html = readFileSync(file, 'utf8');

    // Check for localhost / WP origin URLs
    const localhostHits = findMatches(html, new RegExp(`https?://${escapeRegex(wpHost)}[^"'\\s]*`, 'gi'));
    for (const m of localhostHits) {
      issues.errors.push({ file: rel, line: m.line, msg: `WP origin URL: ${m.match}` });
    }

    // Also catch bare localhost references
    if (!wpHost.includes('localhost')) {
      const lhHits = findMatches(html, /https?:\/\/localhost[:\d]*[^"'\s]*/gi);
      for (const m of lhHits) {
        issues.errors.push({ file: rel, line: m.line, msg: `Localhost URL: ${m.match}` });
      }
    }

    // Check for broken image references (src and srcset handled separately)
    const srcRefs = findMatches(html, /\bsrc="(\/images\/[^"]+)"/gi);
    for (const m of srcRefs) {
      const raw = m.groups?.[0] || '';
      const url = stripQueryHash(raw);
      if (url.startsWith('/images/') && !imageFiles.has(url)) {
        issues.warnings.push({ file: rel, line: m.line, msg: `Missing image: ${url}` });
      }
    }
    // srcset: each candidate is "url [width]" separated by commas
    const srcsetRefs = findMatches(html, /\bsrcset="([^"]+)"/gi);
    for (const m of srcsetRefs) {
      const raw = m.groups?.[0] || '';
      for (const candidate of raw.split(',')) {
        const url = stripQueryHash(candidate.trim().split(/\s+/)[0]);
        if (url.startsWith('/images/') && !imageFiles.has(url)) {
          issues.warnings.push({ file: rel, line: m.line, msg: `Missing image: ${url}` });
        }
      }
    }

    // Check for WP shortcode remnants — real shortcodes use lowercase_slug format
    // Skip bracket text that looks like prose (link text, event titles, etc.)
    const shortcodes = findMatches(html, /\[([a-z_][a-z0-9_-]*)(?:\s[^\]]*?)?\](?:[^[]*\[\/\1\])?/g);
    for (const m of shortcodes) {
      // Skip common non-WP bracket patterns and HTML attributes
      if (/^\[(?:if|else|endif|#|\/|\d)/.test(m.match)) continue;
      issues.warnings.push({ file: rel, line: m.line, msg: `Possible shortcode: ${m.match.slice(0, 60)}` });
    }

    // Check for Elementor classes still present
    const elementorHits = findMatches(html, /class="[^"]*elementor-[^"]*"/gi);
    for (const m of elementorHits) {
      issues.warnings.push({ file: rel, line: m.line, msg: `Elementor class: ${m.match.slice(0, 80)}` });
    }

    // Check for wp-content/uploads paths (should be rewritten to /images/)
    const uploadsHits = findMatches(html, /wp-content\/uploads\//gi);
    for (const m of uploadsHits) {
      issues.errors.push({ file: rel, line: m.line, msg: 'Unrewritten wp-content/uploads/ path' });
    }
  }

  // Report results
  const errorCount = issues.errors.length;
  const warnCount = issues.warnings.length;

  if (errorCount) {
    console.log(`ERRORS (${errorCount}):`);
    for (const e of issues.errors.slice(0, 50)) {
      console.log(`  ${e.file}:${e.line} — ${e.msg}`);
    }
    if (errorCount > 50) console.log(`  ... and ${errorCount - 50} more`);
    console.log();
  }

  if (warnCount) {
    console.log(`WARNINGS (${warnCount}):`);
    for (const w of issues.warnings.slice(0, 50)) {
      console.log(`  ${w.file}:${w.line} — ${w.msg}`);
    }
    if (warnCount > 50) console.log(`  ... and ${warnCount - 50} more`);
    console.log();
  }

  console.log(`Scanned ${htmlFiles.length} HTML files, ${imageFiles.size} images.`);
  console.log(`Result: ${errorCount} errors, ${warnCount} warnings.`);

  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

function walkDir(dir, filter) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full, filter));
    } else if (!filter || (filter instanceof RegExp ? filter.test(entry.name) : entry.name.endsWith(filter))) {
      results.push(full);
    }
  }
  return results;
}

function findMatches(text, regex) {
  const results = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const line = text.slice(0, match.index).split('\n').length;
    results.push({ match: match[0], groups: match.slice(1), line });
  }
  return results;
}

function stripQueryHash(url) {
  return url.split(/[?#]/)[0];
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
