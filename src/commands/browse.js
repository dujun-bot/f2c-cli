import chalk from 'chalk'
import inquirer from 'inquirer'
import ora from 'ora'
import { loadConfig, configExists } from '../utils/config.js'
import { fetchFilePages, fetchFileMeta } from '../figma/client.js'
import { fetchNode } from '../figma/client.js'
import { cleanNode } from '../figma/cleaner.js'
import { generateCode } from '../ai/client.js'
import { writeComponent, toComponentName } from '../generator/writer.js'

export async function browseCommand(options) {
  if (!configExists()) {
    console.log(chalk.yellow('\n  Run `f2c init` first.\n'))
    process.exit(1)
  }

  const config = loadConfig()
  const spinner = ora()

  // ── 获取文件 Key ──
  let fileKey = options.file
  if (!fileKey) {
    const { inputKey } = await inquirer.prompt([{
      type: 'input',
      name: 'inputKey',
      message: 'Figma file key (or paste a Figma file URL):',
      validate: v => v.trim().length > 0 ? true : 'Required'
    }])
    const raw = inputKey.trim()
    // 支持直接贴完整 URL
    if (raw.startsWith('http')) {
      const match = raw.match(/\/(?:file|design)\/([a-zA-Z0-9]+)/)
      fileKey = match ? match[1] : raw
    } else {
      fileKey = raw
    }
  }

  // ── 拉取文件结构 ──
  spinner.start(chalk.gray('Loading file structure...'))
  let pages
  let meta
  try {
    [pages, meta] = await Promise.all([
      fetchFilePages(config.figma.token, fileKey),
      fetchFileMeta(config.figma.token, fileKey)
    ])
    spinner.succeed(chalk.green(`File: ${meta.name}`))
  } catch (e) {
    spinner.fail(chalk.red(`Failed to load file: ${e.message}`))
    process.exit(1)
  }

  // ── 构建选择列表 ──
  const choices = []
  for (const page of pages) {
    if (page.frames.length === 0) continue
    choices.push(new inquirer.Separator(`── ${page.pageName} ──`))
    for (const frame of page.frames) {
      choices.push({
        name: `  ${frame.name}  ${chalk.gray('(' + frame.type + ')')}`,
        value: { nodeId: frame.id, nodeName: frame.name }
      })
    }
  }

  if (choices.length === 0) {
    console.log(chalk.yellow('\n  No frames or components found in this file.\n'))
    process.exit(0)
  }

  const { selected } = await inquirer.prompt([{
    type: 'list',
    name: 'selected',
    message: 'Select a component to convert:',
    choices,
    pageSize: 20
  }])

  // ── 确认输出配置 ──
  const { outDir } = await inquirer.prompt([{
    type: 'input',
    name: 'outDir',
    message: 'Output directory:',
    default: config.output.dir
  }])

  // ── 执行转换 ──
  spinner.start(chalk.gray('Fetching node data...'))
  let rawNode
  try {
    rawNode = await fetchNode(config.figma.token, fileKey, selected.nodeId)
    spinner.succeed(chalk.green(`Fetched: ${rawNode.name}`))
  } catch (e) {
    spinner.fail(chalk.red(`Failed: ${e.message}`))
    process.exit(1)
  }

  spinner.start(chalk.gray('Cleaning Figma JSON...'))
  const cleaned = cleanNode(rawNode)
  spinner.succeed(chalk.green('Cleaned'))

  const providerLabel = config.ai.provider.charAt(0).toUpperCase() + config.ai.provider.slice(1)
  spinner.start(chalk.gray(`Generating code via ${providerLabel}...`))
  let code
  try {
    code = await generateCode(cleaned, config)
    spinner.succeed(chalk.green('Code generated'))
  } catch (e) {
    spinner.fail(chalk.red(`AI error: ${e.message}`))
    process.exit(1)
  }

  spinner.start(chalk.gray('Writing file...'))
  const componentName = toComponentName(rawNode.name)
  const result = await writeComponent(code, componentName, outDir.trim(), config.output)
  spinner.succeed(chalk.green('Done!'))

  console.log('')
  console.log(chalk.cyan('  Component:'), chalk.white(componentName))
  console.log(chalk.cyan('  File:     '), chalk.white(result.filePath))
  console.log('')
}
