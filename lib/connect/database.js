import { execFileSync } from 'node:child_process';

/**
 * Run a SQL query against the WordPress MariaDB container.
 * Returns an array of objects with column names as keys.
 */
export function query(sql, config, { columns = [] } = {}) {
  const { container, db_user, db_password, db_name } = config.wordpress;

  const result = execFileSync('docker', [
    'exec', container, 'mariadb',
    '-u', db_user,
    `-p${db_password}`,
    db_name,
    '--batch', '--silent',
    '-e', sql,
  ], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 60_000,
  });

  const lines = result.trim().split('\n').filter(Boolean);
  if (!lines.length) return [];

  if (columns.length) {
    return lines.map(line => {
      const vals = line.split('\t');
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = vals[i] === 'NULL' ? null : vals[i];
      });
      return obj;
    });
  }

  return lines.map(line => line.split('\t').map(v => v === 'NULL' ? null : v));
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
      // s:length:"value";
      pos += 2; // skip s:
      const lenEnd = str.indexOf(':', pos);
      const len = parseInt(str.slice(pos, lenEnd));
      pos = lenEnd + 2; // skip :"
      const val = str.slice(pos, pos + len);
      pos += len + 2; // skip ";
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
