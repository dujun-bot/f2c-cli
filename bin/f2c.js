#!/usr/bin/env node

import { program } from 'commander'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pkg = require('../package.json')
import { initCommand } from '../src/commands/init.js'
import { convertCommand } from '../src/commands/convert.js'
import { browseCommand } from '../src/commands/browse.js'
import { configCommand } from '../src/commands/config.js'
import { linkCommand } from '../src/commands/link.js'
import { syncCommand } from '../src/commands/sync.js'
import { watchCommand } from '../src/commands/watch.js'
import { licenseCommand } from '../src/commands/license.js'
import chalk from 'chalk'

program
  .name('f2c')
  .description('Convert Figma designs to React / Vue components via AI')
  .version(pkg.version)

program
  .command('init')
  .description('Setup f2c with your tokens and preferences')
  .action(initCommand)

program
  .command('convert')
  .description('Convert a Figma node to a component file')
  .option('-u, --url <figmaUrl>', 'Figma node URL')
  .option('-o, --out <dir>', 'Output directory (overrides config)')
  .option('-f, --framework <framework>', 'react | vue (overrides config)')
  .option('--css <css>', 'tailwind | cssmodules | plain (overrides config)')
  .option('--ts', 'Use TypeScript (overrides config)')
  .action(convertCommand)

program
  .command('link')
  .description('Bind a Figma node to a file in your GitHub repo')
  .option('-u, --url <figmaUrl>', 'Figma node URL')
  .option('-p, --path <filePath>', 'File path in repo (e.g. src/components/Button.vue)')
  .option('-f, --framework <framework>', 'react | vue')
  .option('--css <css>', 'tailwind | cssmodules | plain')
  .option('-l, --list', 'List all links')
  .option('-r, --remove <id>', 'Remove a link by ID')
  .action(linkCommand)

program
  .command('sync [linkId]')
  .description('Detect Figma changes and open a GitHub PR')
  .option('--force', 'Force sync even if no changes detected')
  .action(syncCommand)

program
  .command('watch')
  .description('[Pro] Auto-sync on a schedule (default: every 30 min)')
  .option('-i, --interval <minutes>', 'Polling interval in minutes', '30')
  .action(watchCommand)

program
  .command('license <action> [key]')
  .description('Manage your Pro license (status | activate)')
  .action(licenseCommand)

program
  .command('browse')
  .description('Interactively browse and select Figma components')
  .option('--file <fileKey>', 'Figma file key')
  .action(browseCommand)

program
  .command('config')
  .description('View or update configuration')
  .option('--provider <provider>', 'Switch AI provider: claude | openai')
  .action(configCommand)

program.addHelpText('after', `
${chalk.cyan('Workflow:')}
  1. f2c init                                  Setup tokens
  2. f2c link --url "<figma-url>"              Bind Figma node to a repo file
  3. f2c sync                                  Detect changes, open PR on GitHub
  4. f2c watch                         [Pro]   Auto-sync every 30 min

${chalk.cyan('One-shot convert:')}
  f2c convert --url "<figma-url>" --framework vue

${chalk.cyan('License:')}
  f2c license status
  f2c license activate F2C-XXXX-XXXX-XXXX-XXXX
`)

program.parse()
