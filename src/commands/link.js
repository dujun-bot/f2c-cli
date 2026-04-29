/**
 * f2c link — 将 Figma 节点绑定到本地文件路径
 *
 * 用法：
 *   f2c link --url <figma-url> --path src/components/Button.vue
 *   f2c link --list
 *   f2c link --remove <link-id>
 */

import chalk from 'chalk'
import ora from 'ora'
import inquirer from 'inquirer'
import path from 'path'
import { loadConfig, configExists } from '../utils/config.js'
import { parseFigmaUrl } from '../figma/parser.js'
import { fetchNode } from '../figma/client.js'
import { cleanNode } from '../figma/cleaner.js'
import { toComponentName } from '../generator/writer.js'
import { loadLinks, saveLinks, hashContent, shortId, linksExist } from '../utils/links.js'
import { validateAccess } from '../github/client.js'
import { checkLinkLimit, getLicenseStatus, FREE_LIMIT_LINKS } from '../license/validate.js'

export async function linkCommand(options) {
  // ── 显示已有 links ──
  if (options.list) {
    return showLinks()
  }

  // ── 删除 link ──
  if (options.remove) {
    return removeLink(options.remove)
  }

  // ── 添加新 link ──
  if (!configExists()) {
    console.log(chalk.yellow('\n  Run `f2c init` first.\n'))
    process.exit(1)
  }

  const config = loadConfig()
  const linksData = loadLinks()

  // 许可证检查
  try {
    checkLinkLimit(linksData.links.length)
  } catch (e) {
    if (e.isLicenseError) {
      console.log(chalk.yellow('\n  ' + e.message.split('\n').join('\n  ') + '\n'))
      process.exit(1)
    }
    throw e
  }

  // ── 获取 Figma URL ──
  let url = options.url
  if (!url) {
    const { inputUrl } = await inquirer.prompt([{
      type: 'input', name: 'inputUrl',
      message: 'Figma node URL:',
      validate: v => v.trim().length > 0 ? true : 'Required'
    }])
    url = inputUrl.trim()
  }

  let fileKey, nodeId
  try {
    const parsed = parseFigmaUrl(url)
    fileKey = parsed.fileKey
    nodeId = parsed.nodeId
  } catch (e) {
    console.log(chalk.red(`\n  ${e.message}\n`))
    process.exit(1)
  }

  // ── 检查是否重复绑定 ──
  const existing = linksData.links.find(l => l.nodeId === nodeId)
  if (existing) {
    console.log(chalk.yellow(`\n  This node is already linked to: ${existing.filePath}`))
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm', name: 'overwrite',
      message: 'Overwrite existing link?', default: false
    }])
    if (!overwrite) { console.log(chalk.gray('  Skipped.\n')); return }
    linksData.links = linksData.links.filter(l => l.nodeId !== nodeId)
  }

  const spinner = ora()

  // ── 拉取 Figma 数据（获取组件名） ──
  spinner.start(chalk.gray('Fetching Figma node info...'))
  let rawNode, cleaned
  try {
    rawNode = await fetchNode(config.figma.token, fileKey, nodeId)
    cleaned = cleanNode(rawNode)
    spinner.succeed(chalk.green(`Fetched: ${rawNode.name}`))
  } catch (e) {
    spinner.fail(chalk.red(`Figma error: ${e.message}`))
    process.exit(1)
  }

  const componentName = toComponentName(rawNode.name)

  // ── 获取目标文件路径 ──
  let filePath = options.path
  if (!filePath) {
    const isVue = (options.framework || config.output.framework) === 'vue'
    const defaultExt = isVue ? 'vue' : (config.output.typescript ? 'tsx' : 'jsx')
    const defaultPath = path.join(config.output.dir, `${componentName}.${defaultExt}`)
    const { inputPath } = await inquirer.prompt([{
      type: 'input', name: 'inputPath',
      message: 'File path in your repo (relative to repo root):',
      default: defaultPath,
      validate: v => v.trim().length > 0 ? true : 'Required'
    }])
    filePath = inputPath.trim()
  }

  // ── 初始化 GitHub 配置（仅 Pro 版需要） ──
  const licenseStatus = getLicenseStatus()
  if (licenseStatus.isPro) {
    if (!linksData.repo || !linksData.githubToken) {
      console.log(chalk.cyan('\n  GitHub setup (needed for auto-PR)\n'))

      const ghAnswers = await inquirer.prompt([
        {
          type: 'input', name: 'repo',
          message: 'GitHub repo (owner/repo):',
          default: linksData.repo || '',
          validate: v => /^[\w.-]+\/[\w.-]+$/.test(v.trim()) ? true : 'Format: owner/repo'
        },
        {
          type: 'password', name: 'githubToken',
          message: 'GitHub Personal Access Token (needs repo scope):',
          default: linksData.githubToken || '',
          validate: v => v.trim().length > 0 ? true : 'Required'
        }
      ])

      // 验证 token 权限
      spinner.start(chalk.gray('Validating GitHub access...'))
      const access = await validateAccess(ghAnswers.githubToken.trim(), ghAnswers.repo.trim())
      if (!access.ok) {
        spinner.fail(chalk.red(`GitHub error: ${access.error}`))
        process.exit(1)
      }
      if (!access.canPush) {
        spinner.warn(chalk.yellow('Warning: token may not have push access to this repo'))
      }
      spinner.succeed(chalk.green(`Connected to ${ghAnswers.repo} (default branch: ${access.defaultBranch})`))

      linksData.repo = ghAnswers.repo.trim()
      linksData.githubToken = ghAnswers.githubToken.trim()
    }
  } else {
    // 免费版：跳过 GitHub 配置，输出到本地
    console.log(chalk.gray('\n  Free plan: code will be saved locally (no GitHub PR)'))
    console.log(chalk.gray('  Upgrade to Pro for auto GitHub PR: https://duziteng.gumroad.com/l/f2c-pro\n'))
  }

  // ── 保存 link ──
  const newLink = {
    id: shortId(),
    figmaUrl: url,
    fileKey,
    nodeId,
    componentName,
    filePath,
    framework: options.framework || config.output.framework,
    css: options.css || config.output.css,
    typescript: config.output.typescript,
    contentHash: hashContent(cleaned),
    lastSynced: null
  }

  linksData.links.push(newLink)
  const savedPath = saveLinks(linksData)

  console.log('')
  console.log(chalk.green('  Link saved!'))
  console.log(chalk.cyan('  ID:        '), chalk.white(newLink.id))
  console.log(chalk.cyan('  Component: '), chalk.white(componentName))
  console.log(chalk.cyan('  Figma:     '), chalk.white(url.substring(0, 60) + '...'))
  console.log(chalk.cyan('  File:      '), chalk.white(filePath))
  console.log(chalk.cyan('  Saved to:  '), chalk.white(savedPath))

  const status = getLicenseStatus()
  if (!status.isPro) {
    const remaining = FREE_LIMIT_LINKS - linksData.links.length
    if (remaining === 0) {
      console.log(chalk.yellow(`\n  Free plan: max ${FREE_LIMIT_LINKS} links reached. Upgrade for unlimited: https://duziteng.gumroad.com/l/f2c-pro`))
    } else {
      console.log(chalk.gray(`\n  Free plan: ${remaining} link slot${remaining > 1 ? 's' : ''} remaining`))
    }
  }

  console.log('')
  console.log(chalk.gray('\\n  Run `f2c sync` (Pro) or `f2c convert` to generate code\\n'))
}

function showLinks() {
  const linksData = loadLinks()
  if (!linksData.links.length) {
    console.log(chalk.gray('\n  No links yet. Run `f2c link --url <figma-url>` to add one.\n'))
    return
  }

  console.log(chalk.cyan(`\n  ${linksData.links.length} link(s) — repo: ${linksData.repo || '(not set)'}\n`))
  for (const l of linksData.links) {
    const synced = l.lastSynced
      ? chalk.gray(`  last synced: ${new Date(l.lastSynced).toLocaleString()}`)
      : chalk.yellow('  never synced')
    console.log(`  ${chalk.white(l.id)}  ${chalk.cyan(l.componentName)}  →  ${l.filePath}`)
    console.log(`           ${synced}`)
  }
  console.log('')
}

async function removeLink(id) {
  const linksData = loadLinks()
  const idx = linksData.links.findIndex(l => l.id === id || l.componentName === id)
  if (idx === -1) {
    console.log(chalk.red(`\n  Link "${id}" not found. Run \`f2c link --list\` to see IDs.\n`))
    process.exit(1)
  }
  const removed = linksData.links[idx]
  linksData.links.splice(idx, 1)
  saveLinks(linksData)
  console.log(chalk.green(`\n  Removed link: ${removed.componentName} (${removed.filePath})\n`))
}
