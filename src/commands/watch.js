/**
 * f2c watch — 后台定时轮询 Figma，自动 sync（Pro 功能）
 *
 * 轮询间隔设计：
 *   - 默认 60 分钟：设计师改完稿到工程师感知的合理延迟，不超过 1 小时
 *   - Figma REST API 有速率限制（~60 req/min per token），频繁轮询风险高
 *   - 设计师通常按"批次"提交改动，分钟级轮询意义不大，1 小时足够实时
 *   - 超过 2 小时则反馈太迟，失去 watch 的价值
 *   - 可通过 --interval <分钟数> 覆盖默认值（最短建议 30 分钟）
 *
 * 用法：
 *   f2c watch              # 默认每 60 分钟检查一次
 *   f2c watch --interval 30  # 每 30 分钟（更频繁）
 *   f2c watch --interval 120 # 每 2 小时（低频）
 */

import chalk from 'chalk'
import { requirePro } from '../license/validate.js'
import { syncCommand } from './sync.js'
import { linksExist } from '../utils/links.js'

export async function watchCommand(options) {
  // Pro 门控
  try {
    requirePro('f2c watch')
  } catch (e) {
    if (e.isLicenseError) {
      console.log(chalk.yellow('\n  ' + e.message.split('\n').join('\n  ') + '\n'))
      process.exit(1)
    }
    throw e
  }

  if (!linksExist()) {
    console.log(chalk.gray('\n  No links found. Run `f2c link --url <figma-url>` first.\n'))
    process.exit(1)
  }

  const intervalMin = parseInt(options.interval) || 60
  const intervalMs = intervalMin * 60 * 1000

  console.log(chalk.cyan(`\n  f2c watch started — checking every ${intervalMin} minutes`))
  console.log(chalk.gray('  Press Ctrl+C to stop\n'))

  // 立即执行一次
  await runSync()

  // 定时执行
  const timer = setInterval(runSync, intervalMs)

  // 优雅退出
  process.on('SIGINT', () => {
    clearInterval(timer)
    console.log(chalk.gray('\n  Watch stopped.\n'))
    process.exit(0)
  })
}

async function runSync() {
  const now = new Date().toLocaleTimeString()
  console.log(chalk.gray(`\n  [${now}] Running sync...`))
  try {
    await syncCommand(null, { force: false })
  } catch (e) {
    console.log(chalk.red(`  Sync error: ${e.message}`))
  }
}
