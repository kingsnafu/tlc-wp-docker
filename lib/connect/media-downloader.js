import { existsSync, mkdirSync, createWriteStream, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const CONCURRENCY = 5;
const DOWNLOAD_TIMEOUT = 60_000; // 60 seconds per file

/**
 * Download media files from the manifest to the images/ directory.
 * Skips files that already exist. Writes to a .tmp file and renames on
 * success so partial downloads from failed runs are never treated as complete.
 */
export async function downloadMedia(manifest, outputDir) {
  const imagesDir = join(outputDir, 'images');
  let downloaded = 0;
  let skipped = 0;
  const failures = [];

  // Filter to items with valid paths
  const items = manifest.filter(m => m.relative_path && m.source_url);

  // Process in batches
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(item => downloadOne(item, imagesDir))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        if (result.value === 'downloaded') downloaded++;
        else skipped++;
      } else {
        failures.push({ path: batch[j].relative_path, error: result.reason?.message || String(result.reason) });
      }
    }
  }

  console.log(`  Media downloads: ${downloaded} new, ${skipped} cached, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) {
      console.log(`    FAILED: ${f.path} — ${f.error}`);
    }
  }
}

async function downloadOne(item, imagesDir) {
  const destPath = join(imagesDir, item.relative_path);

  // Skip if final file already exists
  if (existsSync(destPath)) {
    return 'skipped';
  }

  // Ensure directory exists
  mkdirSync(dirname(destPath), { recursive: true });

  const res = await fetch(item.source_url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT) });
  if (!res.ok) {
    throw new Error(`${res.status} fetching ${item.source_url}`);
  }

  // Write to temp file, rename on success — prevents partial files from being cached
  const tmpPath = destPath + '.tmp';
  try {
    const fileStream = createWriteStream(tmpPath);
    await pipeline(Readable.fromWeb(res.body), fileStream);
    renameSync(tmpPath, destPath);
  } catch (err) {
    // Clean up partial temp file
    try { unlinkSync(tmpPath); } catch { /* already gone */ }
    throw err;
  }

  return 'downloaded';
}
