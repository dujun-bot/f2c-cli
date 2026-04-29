/**
 * f2c sync — 检测 Figma 变化，自动创建 GitHub PR
 *
 * 用法：
 *   f2c sync              # 同步所有 links
 *   f2c sync <link-id>    # 同步指定 link
 *   f2c sync --force      # 强制全量同步（忽略 hash 比对）
 */

import chalk from 'chalk'
import ora from 'ora'
import { loadConfig, configExists } from '../utils/config.js'
import { fetchNode } from '../figma/client.js'
import { cleanNode } from '../figma/cleaner.js'
import { generateCode } from '../ai/client.js'
import { writeComponent } from '../generator/writer.js'
import { loadLinks, saveLinks, hashContent } from '../utils/links.js'
import {
  getDefaultBranch, getBranchSha, branchExists,
  createBranch, getFileContent, putFile, createPR, findOpenPR
} from '../github/client.js'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getLicenseStatus, requirePro } from '../license/validate.js'

export async function syncCommand(linkIdArg, options = {}) {
  if (!configExists()) {
    console.log(chalk.yellow('\n  Run `f2c init` first.\n'))
    process.exit(1)
  }

  // ── License 门控：GitHub PR 同步是 Pro 功能 ──
  // 免费版只能用 f2c convert 本地输出，不能用 f2c sync 推 PR
  try {
    requirePro('f2c sync (GitHub PR sync)')
  } catch (e) {
    if (e.isLicenseError) {
      console.log(chalk.yellow('\n  ' + e.message.replace(/\n/g, '\n  ') + '\n'))
      console.log(chalk.gray('  Free plan tip: Use `f2c convert` to generate code locally.\n'))
      process.exit(0)
    }
    throw e
  }

  const linksData = loadLinks()

  if (!linksData.links.length) {
    console.log(chalk.gray('\n  No links configured. Run `f2c link --url <figma-url>` first.\n'))
    return
  }

  if (!linksData.repo || !linksData.githubToken) {
    console.log(chalk.red('\n  GitHub repo/token not set. Run `f2c link` to configure.\n'))
    process.exit(1)
  }

  // 确定要同步的 link 列表
  let targets = linksData.links
  if (linkIdArg) {
    targets = linksData.links.filter(l => l.id === linkIdArg || l.componentName === linkIdArg)
    if (!targets.length) {
      console.log(chalk.red(`\n  Link "${linkIdArg}" not found. Run \`f2c link --list\` to see IDs.\n`))
      process.exit(1)
    }
  }

  const config = loadConfig()
  const { repo, githubToken } = linksData

  console.log(chalk.cyan(`\n  Syncing ${targets.length} link(s) → ${repo}\n`))

  // 拉取默认分支信息（只做一次）
  const spinner = ora()
  spinner.start(chalk.gray('Getting GitHub repo info...'))
  let defaultBranch
  try {
    defaultBranch = await getDefaultBranch(githubToken, repo)
    spinner.succeed(chalk.green(`Repo: ${repo} (base: ${defaultBranch})`))
  } catch (e) {
    spinner.fail(chalk.red(`GitHub error: ${e.message}`))
    process.exit(1)
  }

  const results = []

  for (const link of targets) {
    console.log(chalk.cyan(`\n  ── ${link.componentName} ──`))
    const result = await syncLink({
      link, config, repo, githubToken, defaultBranch,
      force: options.force,
    })
    results.push({ link, ...result })

    // 更新 hash 和 lastSynced（仅成功时）
    if (result.status === 'updated' || result.status === 'created') {
      const idx = linksData.links.findIndex(l => l.id === link.id)
      if (idx !== -1) {
        linksData.links[idx].contentHash = result.newHash
        linksData.links[idx].lastSynced = new Date().toISOString()
      }
    }
  }

  // 保存更新后的 hashes
  saveLinks(linksData)

  // ── 汇总 ──
  console.log(chalk.cyan('\n  ── Summary ──\n'))
  for (const r of results) {
    const icon = r.status === 'updated' ? '✅' :
                 r.status === 'created' ? '🆕' :
                 r.status === 'unchanged' ? '✓ ' :
                 r.status === 'pr_exists' ? '↗ ' : '❌'
    const label = chalk.white(r.link.componentName.padEnd(24))
    if (r.prUrl) {
      console.log(`  ${icon} ${label} ${chalk.green('PR: ' + r.prUrl)}`)
    } else if (r.status === 'unchanged') {
      console.log(`  ${icon} ${label} ${chalk.gray('No changes')}`)
    } else {
      console.log(`  ${icon} ${label} ${chalk.gray(r.message || r.status)}`)
    }
  }
  console.log('')
}

/**
 * 同步单个 link
 */
async function syncLink({ link, config, repo, githubToken, defaultBranch, force }) {
  const spinner = ora()

  // ── Step 1: 拉取 Figma 最新 ──
  spinner.start(chalk.gray('  Fetching from Figma...'))
  let rawNode, cleaned
  try {
    rawNode = await fetchNode(config.figma.token, link.fileKey, link.nodeId)
    cleaned = cleanNode(rawNode)
    spinner.succeed(chalk.green(`  Fetched: ${rawNode.name}`))
  } catch (e) {
    spinner.fail(chalk.red(`  Figma error: ${e.message}`))
    return { status: 'error', message: e.message }
  }

  // ── Step 2: 对比 hash ──
  const newHash = hashContent(cleaned)
  if (!force && link.contentHash === newHash) {
    console.log(chalk.gray('  No design changes detected, skipping.'))
    return { status: 'unchanged', newHash }
  }

  // ── Step 3: 生成代码 ──
  spinner.start(chalk.gray('  Generating code via AI...'))
  let code
  try {
    const outputConfig = {
      framework: link.framework || config.output.framework,
      css: link.css || config.output.css,
      typescript: link.typescript !== undefined ? link.typescript : config.output.typescript,
    }
    code = await generateCode(cleaned, { ...config, output: outputConfig })
    spinner.succeed(chalk.green('  Code generated'))
  } catch (e) {
    spinner.fail(chalk.red(`  AI error: ${e.message}`))
    return { status: 'error', message: e.message }
  }

  // ── Step 4: 格式化代码（复用 writer 但不写本地文件） ──
  const formattedCode = await formatCode(code, link, config)

  // ── Step 5: GitHub 操作 ──
  // 5a. 确定分支名
  const branchName = `f2c/${link.componentName.toLowerCase()}-${Date.now().toString(36)}`

  // 检查是否已有 open PR（避免重复创建）
  const existingPrUrl = await findOpenPR(githubToken, repo, `f2c/${link.componentName.toLowerCase()}`)
  // 注：findOpenPR 用前缀匹配，可能误匹配，这里只是参考提示

  // 5b. 创建分支
  spinner.start(chalk.gray('  Creating GitHub branch...'))
  try {
    const baseSha = await getBranchSha(githubToken, repo, defaultBranch)
    await createBranch(githubToken, repo, branchName, baseSha)
    spinner.succeed(chalk.green(`  Branch: ${branchName}`))
  } catch (e) {
    spinner.fail(chalk.red(`  GitHub branch error: ${e.message}`))
    return { status: 'error', message: e.message }
  }

  // 5c. 获取目标文件现有内容（如果存在）
  const existing = await getFileContent(githubToken, repo, link.filePath, defaultBranch)

  // 5d. 提交文件
  spinner.start(chalk.gray(`  Committing ${link.filePath}...`))
  try {
    const isNewFile = !existing
    const commitMsg = isNewFile
      ? `feat: add ${link.componentName} from Figma [f2c]`
      : `feat: update ${link.componentName} from Figma [f2c]`

    await putFile(
      githubToken, repo, link.filePath,
      formattedCode, commitMsg, branchName,
      existing?.sha || null
    )
    spinner.succeed(chalk.green(`  Committed to ${branchName}`))

    const isCreated = isNewFile
    // 5e. 创建 PR
    spinner.start(chalk.gray('  Creating Pull Request...'))
    const now = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    const prBody = buildPRBody(link, now)
    const prUrl = await createPR(githubToken, repo, {
      title: `[f2c] Update ${link.componentName} — ${now}`,
      body: prBody,
      head: branchName,
      base: defaultBranch
    })
    spinner.succeed(chalk.green(`  PR created: ${prUrl}`))
    return { status: isCreated ? 'created' : 'updated', newHash, prUrl }

  } catch (e) {
    spinner.fail(chalk.red(`  GitHub commit/PR error: ${e.message}`))
    return { status: 'error', message: e.message }
  }
}

/**
 * 格式化代码（临时写入再读取，复用 writer.js 的 prettier 逻辑）
 */
async function formatCode(code, link, config) {
  const tmpDir = path.join(os.tmpdir(), 'f2c-sync')
  const outputConfig = {
    framework: link.framework || config.output.framework,
    css: link.css || config.output.css,
    typescript: link.typescript !== undefined ? link.typescript : config.output.typescript,
    dir: tmpDir
  }

  const result = await writeComponent(code, link.componentName, tmpDir, outputConfig)

  const formatted = fs.readFileSync(result.filePath, 'utf-8')

  // 清理临时文件
  try { fs.unlinkSync(result.filePath) } catch {}

  return formatted
}

/**
 * 构建 PR 描述正文
 */
function buildPRBody(link, timestamp) {
  return `## 🎨 Figma Design Sync

This PR was automatically generated by **f2c** (Figma-to-Code).

| Field | Value |
|-------|-------|
| Component | \`${link.componentName}\` |
| File | \`${link.filePath}\` |
| Framework | ${link.framework} |
| CSS | ${link.css} |
| Generated | ${timestamp} |

**Figma source:** ${link.figmaUrl}

---

> ⚠️ Review carefully before merging. AI-generated code may need manual adjustments for complex interactions.
> 
> To disable auto-sync for this component, run: \`f2c link --remove ${link.id}\`
`
}
