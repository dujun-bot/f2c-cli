import chalk from 'chalk'
import ora from 'ora'
import { loadConfig, configExists } from '../utils/config.js'
import { parseFigmaUrl } from '../figma/parser.js'
import { fetchNode } from '../figma/client.js'
import { cleanNode } from '../figma/cleaner.js'
import { generateCode } from '../ai/client.js'
import { writeComponent, toComponentName } from '../generator/writer.js'
import inquirer from 'inquirer'
import fs from 'fs'
import path from 'path'

export async function convertCommand(options) {
  // ── 前置检查 ──
  if (!configExists()) {
    console.log(chalk.yellow('\n  f2c is not configured yet. Run `f2c init` first.\n'))
    process.exit(1)
  }

  const config = loadConfig()

  if (!config.figma.token) {
    console.log(chalk.red('\n  Figma token missing. Run `f2c init` to reconfigure.\n'))
    process.exit(1)
  }

  if (!config.ai.apiKey && config.ai.provider !== 'ollama') {
    console.log(chalk.red('\n  ' + config.ai.provider + ' API key missing. Run `f2c init` to reconfigure.\n'))
    process.exit(1)
  }

  // ── 获取 URL ──
  let url = options.url
  if (!url) {
    const { inputUrl } = await inquirer.prompt([{
      type: 'input',
      name: 'inputUrl',
      message: 'Figma node URL:',
      validate: v => v.trim().length > 0 ? true : 'URL is required'
    }])
    url = inputUrl.trim()
  }

  // ── 解析 URL ──
  let fileKey, nodeId
  try {
    const parsed = parseFigmaUrl(url)
    fileKey = parsed.fileKey
    nodeId = parsed.nodeId
  } catch (e) {
    console.log(chalk.red(`\n  ${e.message}\n`))
    process.exit(1)
  }

  if (!nodeId) {
    console.log(chalk.red('\n  URL does not contain a node-id. Select a specific layer in Figma and copy the link.\n'))
    process.exit(1)
  }

  // 合并选项（命令行优先于配置文件）
  const outputConfig = {
    ...config.output,
    ...(options.out ? { dir: options.out } : {}),
    ...(options.css ? { css: options.css } : {}),
    ...(options.ts !== undefined ? { typescript: options.ts } : {}),
    ...(options.framework ? { framework: options.framework } : {})
  }

  const spinner = ora()

  try {
    // ── Step 1: 拉取 Figma 数据 ──
    spinner.start(chalk.gray('Fetching Figma data...'))
    const rawNode = await fetchNode(config.figma.token, fileKey, nodeId)
    spinner.succeed(chalk.green(`Fetched: ${rawNode.name}`))

    // ── Step 2: 清洗 JSON ──
    spinner.start(chalk.gray('Cleaning Figma JSON...'))
    const cleaned = cleanNode(rawNode)
    const cleanedStr = JSON.stringify(cleaned)
    const cleanedBytes = Buffer.byteLength(cleanedStr, 'utf8')
    const tokenEstimate = cleanedBytes / 4
    spinner.succeed(chalk.green(`Cleaned (est. ~${Math.round(tokenEstimate)} tokens)`))

    // ── 超大节点预警 ──
    const WARN_BYTES = 50 * 1024  // 50KB
    if (cleanedBytes > WARN_BYTES) {
      const kb = (cleanedBytes / 1024).toFixed(1)
      const rawKb = (Buffer.byteLength(JSON.stringify(rawNode), 'utf8') / 1024).toFixed(1)
      console.log('')
      console.log(chalk.yellow('  ⚠  Large node detected'))
      console.log(chalk.gray(`     Raw:     ${rawKb} KB`))
      console.log(chalk.gray(`     Cleaned: ${kb} KB  (~${Math.round(tokenEstimate).toLocaleString()} tokens)`))
      console.log(chalk.gray('     This node is likely a full page or a large container.'))
      console.log(chalk.gray('     Tip: select a smaller sub-component in Figma for better results.'))
      console.log('')
      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: chalk.yellow('Continue anyway? (may hit model context limits)'),
        default: false
      }])
      if (!proceed) {
        console.log(chalk.gray('\n  Cancelled. Please select a smaller node and try again.\n'))
        process.exit(0)
      }
    }

    // ── Step 3: 调 AI ──
    const providerLabel = config.ai.provider.charAt(0).toUpperCase() + config.ai.provider.slice(1)
    spinner.start(chalk.gray(`Generating code via ${providerLabel}...`))
    // 用合并后的 outputConfig 覆盖 config.output，确保 --framework 等参数生效
    const code = await generateCode(cleaned, { ...config, output: outputConfig })
    spinner.succeed(chalk.green('Code generated'))

    // ── Step 4: 写文件 ──
    const componentName = toComponentName(rawNode.name)
    const isVue = outputConfig.framework === 'vue'
    const ext = isVue ? 'vue' : (outputConfig.typescript ? 'tsx' : 'jsx')
    const outDir = outputConfig.dir

    // 检查文件是否已存在
    const absDir = path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir)
    const targetFile = path.join(absDir, `${componentName}.${ext}`)

    if (fs.existsSync(targetFile)) {
      spinner.stop()
      const { overwrite } = await inquirer.prompt([{
        type: 'confirm',
        name: 'overwrite',
        message: `${componentName}.${ext} already exists. Overwrite?`,
        default: false
      }])
      if (!overwrite) {
        console.log(chalk.gray('\n  Skipped.\n'))
        return
      }
    }

    spinner.start(chalk.gray('Writing file...'))
    const result = await writeComponent(code, componentName, outDir, outputConfig)
    spinner.succeed(chalk.green('Done!'))

    // ── 输出结果 ──
    console.log('')
    console.log(chalk.cyan('  Component:'), chalk.white(componentName))
    console.log(chalk.cyan('  File:     '), chalk.white(result.filePath))
    if (result.cssPath) {
      console.log(chalk.cyan('  CSS:      '), chalk.white(result.cssPath))
    }
    console.log(chalk.cyan('  Provider: '), chalk.white(`${config.ai.provider} / ${config.ai.model}`))
    console.log(chalk.cyan('  CSS:      '), chalk.white(outputConfig.css))
    console.log('')

  } catch (e) {
    spinner.fail(chalk.red(`Error: ${e.message}`))
    if (e.response?.data) {
      console.log(chalk.gray(JSON.stringify(e.response.data, null, 2)))
    }
    process.exit(1)
  }
}
