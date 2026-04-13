import { execFileSync } from 'node:child_process';

/**
 * Run a SQL query against the WordPress MariaDB container.
 * Uses --xml output so field values containing newlines, tabs, or other
 * special characters are safely encoded and parsed.
 *
 * When `columns` is provided, returns objects keyed by those names.
 * Otherwise returns arrays of values (positional).
 */
export function query(sql, config, { columns = [] } = {}) {
  const { container, db_user, db_password, db_name } = config.wordpress;

  const result = execFileSync('docker', [
    'exec', container, 'mariadb',
    '-u', db_user,
    `--password=${db_password}`,
    db_name,
    '--xml',
    '-e', sql,
  ], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 60_000,
  });

  return parseXmlResult(result, columns);
}

/**
 * Parse MariaDB --xml output into rows.
 *
 * XML format:
 *   <row>
 *     <field name="col">value</field>
 *     <field name="col" xsi:nil="true" />   ← NULL
 *   </row>
 */
function parseXmlResult(xml, columns) {
  const rows = [];
  const rowRe = /<row>([\s\S]*?)<\/row>/g;
  const fieldRe = /<field name="([^"]*)"(?:\s+xsi:nil="true"\s*\/>|>([\s\S]*?)<\/field>)/g;

  let rowMatch;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const rowXml = rowMatch[1];
    const vals = [];
    let fieldMatch;
    fieldRe.lastIndex = 0;
    while ((fieldMatch = fieldRe.exec(rowXml)) !== null) {
      // fieldMatch[1] = column name, fieldMatch[2] = value (undefined if nil)
      const value = fieldMatch[2] !== undefined ? xmlDecode(fieldMatch[2]) : null;
      vals.push(value);
    }

    if (columns.length) {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = vals[i] ?? null; });
      rows.push(obj);
    } else {
      rows.push(vals);
    }
  }

  return rows;
}

/**
 * Decode XML entities back to plain text.
 * Order matters: named entities and numeric refs first, &amp; absolutely last
 * to avoid double-decoding (e.g., literal "&#10;" stored as "&amp;#10;" in XML).
 */
function xmlDecode(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

/**
 * Query that returns a single scalar value.
 */
export function queryScalar(sql, config) {
  const rows = query(sql, config);
  return rows[0]?.[0] ?? null;
}

/**
 * Deserialize PHP serialized strings (basic types: s, i, b, a).
 * Handles the subset used by WordPress options and Gravity Forms.
 */
export function phpUnserialize(str) {
  if (!str || typeof str !== 'string') return str;

  let pos = 0;

  function read() {
    const type = str[pos];

    if (type === 's') {
      // s:byteLen:"value"; — PHP serialize stores UTF-8 byte length, not char count
      pos += 2; // skip s:
      const lenEnd = str.indexOf(':', pos);
      const byteLen = parseInt(str.slice(pos, lenEnd));
      pos = lenEnd + 2; // skip :"

      // Advance by byteLen UTF-8 bytes, counting actual JS characters
      let bytes = 0;
      const start = pos;
      while (bytes < byteLen) {
        const code = str.charCodeAt(pos);
        if (code < 0x80) { bytes += 1; pos += 1; }
        else if (code < 0x800) { bytes += 2; pos += 1; }
        else if (code >= 0xD800 && code <= 0xDBFF) { bytes += 4; pos += 2; } // surrogate pair
        else { bytes += 3; pos += 1; }
      }
      const val = str.slice(start, pos);
      pos += 2; // skip ";
      return val;
    }

    if (type === 'i') {
      // i:value;
      pos += 2;
      const end = str.indexOf(';', pos);
      const val = parseInt(str.slice(pos, end));
      pos = end + 1;
      return val;
    }

    if (type === 'b') {
      // b:0; or b:1;
      pos += 2;
      const val = str[pos] === '1';
      pos += 2;
      return val;
    }

    if (type === 'd') {
      // d:value;
      pos += 2;
      const end = str.indexOf(';', pos);
      const val = parseFloat(str.slice(pos, end));
      pos = end + 1;
      return val;
    }

    if (type === 'N') {
      // N;
      pos += 2;
      return null;
    }

    if (type === 'a') {
      // a:count:{...}
      pos += 2;
      const lenEnd = str.indexOf(':', pos);
      const count = parseInt(str.slice(pos, lenEnd));
      pos = lenEnd + 2; // skip :{
      const obj = {};
      let isSequential = true;
      for (let i = 0; i < count; i++) {
        const key = read();
        const val = read();
        obj[key] = val;
        if (key !== i) isSequential = false;
      }
      pos += 1; // skip }
      return isSequential ? Object.values(obj) : obj;
    }

    // Unknown type — skip ahead
    pos++;
    return null;
  }

  try {
    return read();
  } catch {
    return str;
  }
}
