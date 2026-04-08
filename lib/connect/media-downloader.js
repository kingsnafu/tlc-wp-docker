import { existsSync, mkdirSync, statSync, createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const CONCURRENCY = 5;

/**
 * Download media files from the manifest to the images/ directory.
 * Skips files that already exist with matching size.
 */
export async function downloadMedia(manifest, outputDir) {
  const imagesDir = join(outputDir, 'images');
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  // Filter to items with valid paths
  const items = manifest.filter(m => m.relative_path && m.source_url);

  // Process in batches
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(item => downloadOne(item, imagesDir))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value === 'downloaded') downloaded++;
        else skipped++;
      } else {
        failed++;
      }
    }
  }

  console.log(`  Media downloads: ${downloaded} new, ${skipped} cached, ${failed} failed`);
}

async function downloadOne(item, imagesDir) {
  const destPath = join(imagesDir, item.relative_path);

  // Skip if file exists
  if (existsSync(destPath)) {
    return 'skipped';
  }

  // Ensure directory exists
  mkdirSync(dirname(destPath), { recursive: true });

  const res = await fetch(item.source_url);
  if (!res.ok) {
    throw new Error(`${res.status} fetching ${item.source_url}`);
  }

  const fileStream = createWriteStream(destPath);
  await pipeline(Readable.fromWeb(res.body), fileStream);

  return 'downloaded';
}
