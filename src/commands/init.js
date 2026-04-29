import inquirer from 'inquirer'
import chalk from 'chalk'
import { saveConfig, loadConfig, configExists } from '../utils/config.js'

export async function initCommand() {
  console.log(chalk.cyan('\n  Welcome to f2c — Figma to Code\n'))

  if (configExists()) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'Config already exists. Reconfigure?',
      default: false
    }])
    if (!overwrite) {
      console.log(chalk.gray('  Skipped. Run `f2c config` to view current settings.\n'))
      return
    }
  }

  const existing = loadConfig()

  const answers = await inquirer.prompt([
    {
      type: 'password',
      name: 'figmaToken',
      message: 'Figma Personal Access Token (figma.com → Settings → Personal access tokens):',
      default: existing.figma.token || '',
      validate: v => v.trim().length > 0 ? true : 'Token is required'
    },
    {
      type: 'list',
      name: 'provider',
      message: 'AI Provider:',
      choices: [
        { name: 'Claude (Anthropic) — recommended', value: 'claude' },
        { name: 'OpenAI (GPT-4o)', value: 'openai' },
        { name: 'Ollama (local, free)', value: 'ollama' }
      ],
      default: existing.ai.provider || 'claude'
    },
    {
      type: 'password',
      name: 'apiKey',
      message: answers => {
        const labels = { claude: 'Anthropic API Key', openai: 'OpenAI API Key', ollama: 'Ollama base URL (leave blank for default http://localhost:11434)' }
        return labels[answers.provider] + ':'
      },
      default: existing.ai.apiKey || '',
      validate: (v, answers) => {
        if (answers.provider === 'ollama') return true
        return v.trim().length > 0 ? true : 'API Key is required'
      }
    },
    {
      type: 'input',
      name: 'baseURL',
      message: 'Custom API base URL? (leave blank to use default):',
      default: existing.ai.baseURL || '',
      when: answers => answers.provider === 'claude'
    },
    {
      type: 'list',
      name: 'framework',
      message: 'Default framework:',
      choices: [
        { name: 'React (TSX/JSX)', value: 'react' },
        { name: 'Vue 3 (SFC)', value: 'vue' }
      ],
      default: existing.output.framework || 'react'
    },
    {
      type: 'list',
      name: 'css',
      message: 'Default CSS solution:',
      choices: [
        { name: 'Tailwind CSS', value: 'tailwind' },
        { name: 'CSS Modules', value: 'cssmodules' },
        { name: 'Plain CSS', value: 'plain' }
      ],
      default: existing.output.css || 'tailwind'
    },
    {
      type: 'confirm',
      name: 'typescript',
      message: 'Use TypeScript (.tsx)?',
      default: existing.output.typescript !== undefined ? existing.output.typescript : true
    },
    {
      type: 'input',
      name: 'dir',
      message: 'Default output directory:',
      default: existing.output.dir || './src/components'
    }
  ])

  const modelMap = {
    claude: 'claude-opus-4-6',
    openai: 'gpt-4o',
    ollama: 'codellama'
  }

  const config = {
    figma: {
      token: answers.figmaToken.trim()
    },
    ai: {
      provider: answers.provider,
      apiKey: answers.provider === 'ollama' ? '' : answers.apiKey.trim(),
      baseURL: answers.baseURL?.trim() || '',
      model: modelMap[answers.provider]
    },
    output: {
      framework: answers.framework,
      css: answers.css,
      typescript: answers.typescript,
      dir: answers.dir.trim()
    }
  }

  saveConfig(config)

  console.log(chalk.green('\n  Config saved to ~/.f2c/config.json'))
  console.log(chalk.gray('  Run `f2c convert --url <figma-url>` to get started\n'))
}
