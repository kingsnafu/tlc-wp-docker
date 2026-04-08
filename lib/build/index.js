import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { scaffold } from './scaffold.js';

/**
 * Build the static site with Eleventy.
 */
export async function build(config, { serve = false } = {}) {
  const projectDir = process.cwd();

  // Ensure template is scaffolded
  scaffold(config, projectDir);

  const eleventyBin = resolve(projectDir, 'node_modules/.bin/eleventy');
  const args = ['--config=eleventy.config.js'];

  if (serve) {
    args.push('--serve');
    console.log('Starting Eleventy dev server...');
  } else {
    console.log('Building static site...');
  }

  execFileSync(process.platform === 'win32' ? 'npx' : eleventyBin,
    process.platform === 'win32' ? ['eleventy', ...args] : args,
    {
      cwd: projectDir,
      stdio: 'inherit',
      timeout: 300_000,
    }
  );
}
