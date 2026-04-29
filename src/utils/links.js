import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const LINKS_FILE = '.f2c-links.json'

/**
 * 在当前目录或父目录查找 .f2c-links.json
 */
export function findLinksFile(startDir = process.cwd()) {
  let dir = startDir
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, LINKS_FILE)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * 读取 links 配置（找不到则返回空结构）
 */
export function loadLinks(filePath = null) {
  const p = filePath || findLinksFile()
  if (!p || !fs.existsSync(p)) {
    return { repo: '', githubToken: '', links: [] }
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return { repo: '', githubToken: '', links: [] }
  }
}

/**
 * 写入 links 配置（总是写到 cwd/.f2c-links.json）
 */
export function saveLinks(data, filePath = null) {
  const p = filePath || path.join(process.cwd(), LINKS_FILE)
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
  return p
}

/**
 * 计算 cleaned JSON 的 MD5 hash（用于变化检测）
 */
export function hashContent(obj) {
  const str = JSON.stringify(obj)
  return crypto.createHash('md5').update(str).digest('hex')
}

/**
 * 生成短 ID
 */
export function shortId() {
  return crypto.randomBytes(4).toString('hex')
}

/**
 * 检查 links 文件是否存在于当前项目
 */
export function linksExist() {
  return !!findLinksFile()
}
