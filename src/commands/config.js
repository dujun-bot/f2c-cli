import chalk from 'chalk'
import { loadConfig, updateConfig, configExists } from '../utils/config.js'

export async function configCommand(options) {
  if (!configExists()) {
    console.log(chalk.yellow('\n  Not configured yet. Run `f2c init` first.\n'))
    process.exit(1)
  }

  // 切换 provider
  if (options.provider) {
    const valid = ['claude', 'openai', 'ollama']
    if (!valid.includes(options.provider)) {
      console.log(chalk.red(`\n  Invalid provider. Choose from: ${valid.join(', ')}\n`))
      process.exit(1)
    }
    updateConfig({ ai: { provider: options.provider } })
    console.log(chalk.green(`\n  Provider switched to: ${options.provider}\n`))
    return
  }

  // 显示当前配置（隐藏敏感信息）
  const config = loadConfig()
  console.log(chalk.cyan('\n  Current f2c configuration:\n'))
  console.log(chalk.gray('  Figma'))
  console.log(`    token:     ${maskToken(config.figma.token)}`)
  console.log('')
  console.log(chalk.gray('  AI'))
  console.log(`    provider:  ${config.ai.provider}`)
  console.log(`    model:     ${config.ai.model || '(default)'}`)
  console.log(`    apiKey:    ${maskToken(config.ai.apiKey)}`)
  if (config.ai.baseURL) {
    console.log(`    baseURL:   ${config.ai.baseURL}`)
  }
  console.log('')
  console.log(chalk.gray('  Output'))
  console.log(`    framework: ${config.output.framework}`)
  console.log(`    css:       ${config.output.css}`)
  console.log(`    typescript:${config.output.typescript}`)
  console.log(`    dir:       ${config.output.dir}`)
  console.log('')
  console.log(chalk.gray(`  Config file: ~/.f2c/config.json`))
  console.log('')
}

function maskToken(token) {
  if (!token) return chalk.red('(not set)')
  if (token.length <= 8) return '****'
  return token.slice(0, 4) + '****' + token.slice(-4)
}
