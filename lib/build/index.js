import { execFileSync, spawn } from 'node:child_process';
import { resolve as pathResolve } from 'node:path';
import { scaffold } from './scaffold.js';

/**
 * Build the static site with Eleventy.
 */
export async function build(config, { serve = false } = {}) {
  const projectDir = process.cwd();

  // Ensure template is scaffolded
  scaffold(config, projectDir);

  const eleventyBin = pathResolve(projectDir, 'node_modules/.bin/eleventy');
  const args = ['--config=eleventy.config.js'];
  if (serve) args.push('--serve');

  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'npx' : eleventyBin;
  const cmdArgs = isWin ? ['eleventy', ...args] : args;
  // Windows requires shell: true to execute .cmd batch files like npx
  const shellOpt = isWin ? { shell: true } : {};

  if (serve) {
    console.log('Starting Eleventy dev server...');

    // Use spawn so the dev server runs until the user stops it (Ctrl+C)
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, cmdArgs, { cwd: projectDir, stdio: 'inherit', ...shellOpt });
      child.on('close', (code) => {
        if (code === 0 || code === null) resolve();
        else reject(new Error(`Eleventy exited with code ${code}`));
      });
      child.on('error', reject);
    });
  }

  console.log('Building static site...');
  execFileSync(cmd, cmdArgs, {
    cwd: projectDir,
    stdio: 'inherit',
    timeout: 300_000,
    ...shellOpt,
  });
}
