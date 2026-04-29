/**
 * f2c license — 管理 Pro license
 *
 * 用法：
 *   f2c license status
 *   f2c license activate F2C-XXXX-XXXX-XXXX-XXXX
 */

import chalk from 'chalk'
import { activateLicense, getLicenseStatus } from '../license/validate.js'
import ora from 'ora'

export async function licenseCommand(action, key) {
  if (!action || action === 'status') {
    return showStatus()
  }

  if (action === 'activate') {
    if (!key) {
      console.log(chalk.red('\n  Usage: f2c license activate <your-key>\n'))
      process.exit(1)
    }
    return activate(key)
  }

  console.log(chalk.red(`\n  Unknown action: ${action}. Use "status" or "activate".\n`))
  process.exit(1)
}

function showStatus() {
  const status = getLicenseStatus()
  console.log('')
  if (status.isPro) {
    console.log(chalk.green('  License: Pro ✓'))
    if (status.email) console.log(chalk.gray(`  Email:   ${status.email}`))
    console.log(chalk.gray(`  Key:     ${status.key}`))
    if (status.status === 'pending') {
      console.log(chalk.yellow('  Note: Activation pending (no server connection at time of activation)'))
    }
  } else {
    console.log(chalk.yellow('  License: Free'))
    console.log(chalk.gray('  Limits:  3 links, no f2c watch'))
    console.log(chalk.cyan('  Upgrade: https://duziteng.gumroad.com/l/f2c-pro'))
    console.log(chalk.gray('  Activate: f2c license activate <your-key>'))
  }
  console.log('')
}

async function activate(key) {
  const spinner = ora()
  spinner.start(chalk.gray('Activating license...'))
  const result = await activateLicense(key.trim())
  if (result.ok) {
    spinner.succeed(chalk.green('License activated!'))
    if (result.warning) console.log(chalk.yellow(`  Warning: ${result.warning}`))
    if (result.email) console.log(chalk.gray(`  Registered to: ${result.email}`))
    console.log(chalk.cyan('\n  All Pro features are now unlocked.\n'))
  } else {
    spinner.fail(chalk.red(`Activation failed: ${result.error}`))
    process.exit(1)
  }
}
