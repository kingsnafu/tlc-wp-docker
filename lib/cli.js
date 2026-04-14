import { parseArgs } from 'node:util';
import { loadConfig } from './config.js';

const COMMANDS = ['audit', 'extract', 'build', 'deploy', 'run', 'validate'];

function usage() {
  console.log(`wp-to-static — WordPress to static site generator

Usage: wp-to-static <command> [options]

Commands:
  audit     Connect to WP and report content counts
  extract   Extract all content from WP to local files
  build     Generate static site with Eleventy (--serve for dev server)
  deploy    Deploy to Cloudflare Pages
  run       Extract → Build → Deploy in sequence
  validate  Scan _site/ for localhost URLs, broken images, WP artifacts

Options:
  --serve   Start Eleventy dev server (build command only)
  --help    Show this help`);
}

export async function run(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      serve: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    usage();
    process.exit(0);
  }

  const command = positionals[0];
  if (!COMMANDS.includes(command)) {
    console.error(`Unknown command: ${command}\n`);
    usage();
    process.exit(1);
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  try {
    switch (command) {
      case 'audit': {
        const { audit } = await import('./commands/audit.js');
        await audit(config);
        break;
      }
      case 'extract': {
        const { extract } = await import('./extract/index.js');
        await extract(config);
        break;
      }
      case 'build': {
        const { build } = await import('./commands/build.js');
        await build(config, { serve: values.serve });
        break;
      }
      case 'deploy': {
        const { deploy } = await import('./deploy/cloudflare-pages.js');
        await deploy(config);
        break;
      }
      case 'run': {
        const { extract } = await import('./extract/index.js');
        const { build } = await import('./commands/build.js');
        const { deploy } = await import('./deploy/cloudflare-pages.js');
        console.log('=== Extract ===');
        await extract(config);
        console.log('\n=== Build ===');
        await build(config, { serve: false });
        console.log('\n=== Deploy ===');
        await deploy(config);
        break;
      }
      case 'validate': {
        const { validate } = await import('./commands/validate.js');
        validate(config);
        break;
      }
    }
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
}
