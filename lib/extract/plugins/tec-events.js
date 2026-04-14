import { query } from '../../connect/database.js';
import { decodeHtmlEntities } from '../../transform/clean-content.js';

/**
 * Extract The Events Calendar data from the WordPress database.
 * Port of extract_events.py — queries TEC tables for events, venues,
 * organizers, categories, and recurrence patterns.
 */
export async function extractTecEvents(config, { mediaMap = {} } = {}) {
  const prefix = config.wordpress.table_prefix;
  const rawCutoff = config.events?.cutoff_date;
  const cutoff = (rawCutoff && /^\d{4}-\d{2}-\d{2}$/.test(String(rawCutoff)))
    ? String(rawCutoff)
    : new Date().toISOString().slice(0, 10);
  const files = [];

  // Step 1: Get distinct event_ids with future occurrences
  const eventRows = query(
    `SELECT DISTINCT te.event_id, te.post_id ` +
    `FROM ${prefix}tec_events te ` +
    `JOIN ${prefix}tec_occurrences occ ON te.event_id = occ.event_id ` +
    `JOIN ${prefix}posts p ON te.post_id = p.ID ` +
    `WHERE occ.start_date >= '${cutoff}' ` +
    `  AND p.post_status = 'publish' ` +
    `ORDER BY te.event_id`,
    config,
    { columns: ['event_id', 'post_id'] }
  );

  if (!eventRows.length) {
    console.log('  Events: 0');
    return { files: [], data: { events: { meta: {}, series: [], events: [] } } };
  }

  const eventIds = eventRows.map(r => [parseInt(r.event_id), parseInt(r.post_id)]);
  const postIds = eventIds.map(([, pid]) => pid);
  const eidToPid = Object.fromEntries(eventIds);
  const pidList = postIds.join(',');
  const eidList = eventIds.map(([eid]) => eid).join(',');

  // Step 2: Get post data for all series
  const postsRows = query(
    `SELECT ID, post_title, post_name, post_content ` +
    `FROM ${prefix}posts WHERE ID IN (${pidList})`,
    config,
    { columns: ['ID', 'post_title', 'post_name', 'post_content'] }
  );
  const posts = {};
  for (const r of postsRows) {
    posts[parseInt(r.ID)] = { title: decodeHtmlEntities(r.post_title) || r.post_title, slug: r.post_name, description: r.post_content };
  }

  // Step 3: Get meta for all posts
  const metaRows = query(
    `SELECT post_id, meta_key, meta_value FROM ${prefix}postmeta ` +
    `WHERE post_id IN (${pidList}) ` +
    `AND meta_key IN ('_EventURL','_tribe_featured','_thumbnail_id')`,
    config,
    { columns: ['post_id', 'meta_key', 'meta_value'] }
  );
  const meta = {};
  for (const r of metaRows) {
    const pid = parseInt(r.post_id);
    if (!meta[pid]) meta[pid] = {};
    meta[pid][r.meta_key] = r.meta_value;
  }

  // Step 4: Resolve featured images via mediaMap (consistent with pages/posts)

  // Step 5: Get categories
  const catRows = query(
    `SELECT tr.object_id, t.slug ` +
    `FROM ${prefix}term_relationships tr ` +
    `JOIN ${prefix}term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id ` +
    `JOIN ${prefix}terms t ON tt.term_id = t.term_id ` +
    `WHERE tt.taxonomy = 'tribe_events_cat' ` +
    `AND tr.object_id IN (${pidList}) ` +
    `ORDER BY tr.object_id, t.slug`,
    config,
    { columns: ['object_id', 'slug'] }
  );
  const categories = {};
  for (const r of catRows) {
    const pid = parseInt(r.object_id);
    if (!categories[pid]) categories[pid] = [];
    categories[pid].push(r.slug);
  }

  // Step 6: Get rset (recurrence pattern) for each event
  const rsetRows = query(
    `SELECT event_id, rset FROM ${prefix}tec_events WHERE event_id IN (${eidList})`,
    config,
    { columns: ['event_id', 'rset'] }
  );
  const rsets = {};
  for (const r of rsetRows) {
    rsets[parseInt(r.event_id)] = r.rset;
  }

  // Step 7: Get all future occurrences
  const occRows = query(
    `SELECT occ.event_id, occ.post_id, occ.start_date, occ.end_date, ` +
    `occ.has_recurrence, occ.sequence ` +
    `FROM ${prefix}tec_occurrences occ ` +
    `WHERE occ.event_id IN (${eidList}) ` +
    `AND occ.start_date >= '${cutoff}' ` +
    `ORDER BY occ.event_id, occ.start_date`,
    config,
    { columns: ['event_id', 'post_id', 'start_date', 'end_date', 'has_recurrence', 'sequence'] }
  );

  // Get occurrence-level ticket URLs
  const occPostIds = [...new Set(occRows.map(r => parseInt(r.post_id)))];
  const occMeta = {};
  if (occPostIds.length) {
    const occMetaRows = query(
      `SELECT post_id, meta_key, meta_value FROM ${prefix}postmeta ` +
      `WHERE post_id IN (${occPostIds.join(',')}) ` +
      `AND meta_key IN ('_EventURL','_tribe_featured')`,
      config,
      { columns: ['post_id', 'meta_key', 'meta_value'] }
    );
    for (const r of occMetaRows) {
      const pid = parseInt(r.post_id);
      if (!occMeta[pid]) occMeta[pid] = {};
      occMeta[pid][r.meta_key] = r.meta_value;
    }
  }

  // Group occurrences by event_id
  const occByEvent = {};
  for (const r of occRows) {
    const eid = parseInt(r.event_id);
    const occPid = parseInt(r.post_id);
    if (!occByEvent[eid]) occByEvent[eid] = [];

    const occ = {
      date: (r.start_date || '').slice(0, 10),
      time: (r.start_date || '').slice(11, 16),
      end_time: r.end_date ? r.end_date.slice(11, 16) : null,
    };

    const occTicket = occMeta[occPid]?._EventURL || null;
    if (occTicket) occ.ticket_url = occTicket;

    occByEvent[eid].push(occ);
  }

  // Step 8: Build series + one-off structure
  const seriesList = [];
  const oneoffList = [];

  for (const [eid, pid] of eventIds) {
    const post = posts[pid] || {};
    const m = meta[pid] || {};

    const thumbId = m._thumbnail_id ? parseInt(m._thumbnail_id) : null;
    const imgPath = thumbId ? (mediaMap[thumbId] || null) : null;

    let ticketUrl = m._EventURL || null;
    if (!ticketUrl || ticketUrl === 'NULL') ticketUrl = null;

    const featured = m._tribe_featured === '1';
    const rset = rsets[eid] || '';
    const recurrence = parseRset(rset);
    const isRecurring = recurrence?.frequency;
    const occs = occByEvent[eid] || [];
    const firstOcc = occs[0] || {};

    const entry = {
      id: post.slug || `event-${eid}`,
      title: post.title || '',
      slug: post.slug || '',
      description: (post.description || '').trim(),
      image: imgPath,
      categories: categories[pid] || [],
      ticket_url: ticketUrl,
      featured,
    };

    if (isRecurring) {
      entry.recurrence = recurrence;
      entry.occurrences = occs;
      seriesList.push(entry);
    } else {
      entry.date = firstOcc.date || null;
      entry.time = firstOcc.time || null;
      entry.end_time = firstOcc.end_time || null;
      if (firstOcc.ticket_url) entry.ticket_url = firstOcc.ticket_url;
      oneoffList.push(entry);
    }

    // Write individual event markdown files
    const datePrefix = entry.date || (occs[0]?.date) || 'undated';
    const frontMatter = {
      title: entry.title,
      slug: entry.slug,
      date: entry.date || firstOcc.date,
      time: entry.time || firstOcc.time,
      end_time: entry.end_time || firstOcc.end_time,
      image: entry.image,
      categories: entry.categories,
      ticket_url: entry.ticket_url,
      featured: entry.featured,
      recurring: !!isRecurring,
    };

    const fmLines = Object.entries(frontMatter)
      .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
      .map(([k, v]) => {
        if (Array.isArray(v)) {
          return `${k}:\n${v.map(i => `  - ${JSON.stringify(i)}`).join('\n')}`;
        }
        return `${k}: ${JSON.stringify(v)}`;
      })
      .join('\n');

    const md = `---\n${fmLines}\n---\n\n${entry.description}\n`;
    files.push({ path: `content/events/${datePrefix}-${entry.slug || `event-${eid}`}.md`, content: md });
  }

  const totalOccurrences = seriesList.reduce((sum, s) => sum + (s.occurrences?.length || 0), 0) + oneoffList.length;

  const eventsData = {
    meta: {
      generated: new Date().toISOString().slice(0, 10),
      source: 'wp-to-static TEC extractor',
      filter: `occurrences >= ${cutoff}`,
      series_count: seriesList.length,
      oneoff_count: oneoffList.length,
      total_occurrences: totalOccurrences,
    },
    series: seriesList,
    events: oneoffList,
  };

  console.log(`  Events: ${seriesList.length} series + ${oneoffList.length} one-off (${totalOccurrences} total occurrences)`);
  return { files, data: { events: eventsData } };
}

/**
 * Parse an RRULE recurrence pattern string.
 */
function parseRset(rsetStr) {
  if (!rsetStr) return null;

  const rruleMatch = rsetStr.match(/RRULE:(.+)/);
  if (!rruleMatch) return null;

  const rrule = rruleMatch[1].trim();
  const parts = Object.fromEntries(
    rrule.split(';').filter(p => p.includes('=')).map(p => p.split('=', 2))
  );

  const pattern = { raw: rrule, frequency: (parts.FREQ || '').toLowerCase() };

  if (parts.BYDAY) {
    const dayMap = { mo: 'monday', tu: 'tuesday', we: 'wednesday', th: 'thursday', fr: 'friday', sa: 'saturday', su: 'sunday' };
    pattern.days = parts.BYDAY.toLowerCase().split(',').map(d => dayMap[d.replace(/[-\d]/g, '')] || d);
  }
  if (parts.INTERVAL) pattern.interval = parseInt(parts.INTERVAL);
  if (parts.COUNT) pattern.count = parseInt(parts.COUNT);
  if (parts.UNTIL) {
    const u = parts.UNTIL;
    pattern.until = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`;
  }

  const exdateMatch = rsetStr.match(/EXDATE:(.+)/);
  if (exdateMatch) {
    pattern.excluded_dates = exdateMatch[1].split(',').map(d => d.trim());
  }

  return pattern;
}
