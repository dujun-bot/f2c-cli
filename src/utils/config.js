import os from 'os'
import fs from 'fs'
import path from 'path'

const CONFIG_DIR = path.join(os.homedir(), '.f2c')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG = {
  figma: {
    token: ''
  },
  ai: {
    provider: 'claude',
    apiKey: '',
    baseURL: '',
    model: ''
  },
  output: {
    framework: 'react',
    css: 'tailwind',
    typescript: true,
    dir: './src/components'
  }
}

export function getConfigPath() {
  return CONFIG_FILE
}

export function configExists() {
  return fs.existsSync(CONFIG_FILE)
}

export function loadConfig() {
  // 先加载全局配置
  let config = { ...DEFAULT_CONFIG }
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const saved = JSON.parse(raw)
      config = deepMerge(config, saved)
    } catch (e) {
      // 配置文件损坏，使用默认值
    }
  }

  // 项目级 .f2crc 覆盖全局配置（团队多项目场景）
  const localRc = path.join(process.cwd(), '.f2crc')
  if (fs.existsSync(localRc)) {
    try {
      const local = JSON.parse(fs.readFileSync(localRc, 'utf-8'))
      config = deepMerge(config, local)
    } catch (e) {}
  }

  return config
}

export function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

export function updateConfig(partial) {
  const current = loadConfig()
  const updated = deepMerge(current, partial)
  saveConfig(updated)
  return updated
}

function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(target[key] || {}, source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}
