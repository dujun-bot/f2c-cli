/**
 * License Key 验证
 *
 * 免费版限制：
 *   - 最多 3 个 f2c link
 *   - 不支持 f2c watch (自动轮询)
 *
 * Pro 版：
 *   - 无限 link
 *   - f2c watch
 *   - 优先支持
 *
 * 验证方式：
 *   本地格式校验（即时）+ 远端激活校验（7 天缓存）
 *   离线时使用缓存，缓存过期才重新验证
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

const CONFIG_DIR = path.join(os.homedir(), '.f2c')
const LICENSE_FILE = path.join(CONFIG_DIR, 'license.json')

// 真实服务端 URL（Cloudflare Worker 部署后的地址）
// 可以通过环境变量覆盖（开发/测试用）
const LICENSE_SERVER =
  process.env.F2C_LICENSE_SERVER ||
  'https://f2c-license.duziteng1987.workers.dev'

// 本地缓存有效期（7天）
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// 免费版限制
export const FREE_LIMIT_LINKS = 3

// ── 本地缓存 ──────────────────────────────────────────────────────────────────

function readLicenseCache() {
  if (!fs.existsSync(LICENSE_FILE)) return null
  try {
    return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf-8'))
  } catch {
    return null
  }
}

function writeLicenseCache(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

// ── 格式校验 ──────────────────────────────────────────────────────────────────

function isValidFormat(key) {
  // LemonSqueezy 默认生成 UUID 格式，也接受 F2C- 前缀格式
  return /^F2C-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(key) ||
    /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(key)
}

// ── 机器指纹 ──────────────────────────────────────────────────────────────────

function getMachineId() {
  const machineIdFile = path.join(CONFIG_DIR, '.machine_id')
  if (fs.existsSync(machineIdFile)) {
    return fs.readFileSync(machineIdFile, 'utf-8').trim()
  }
  const id = crypto.randomBytes(16).toString('hex')
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(machineIdFile, id, 'utf-8')
  return id
}

// ── 服务端请求 ────────────────────────────────────────────────────────────────

async function callServer(endpoint, body) {
  try {
    const res = await fetch(`${LICENSE_SERVER}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    return { status: res.status, data }
  } catch {
    return null   // 网络不通
  }
}

// ── 公开 API ──────────────────────────────────────────────────────────────────

/**
 * 首次激活 license key（向服务端注册，绑定本机）
 * 返回 { ok: boolean, error?: string, plan?: string, email?: string }
 */
export async function activateLicense(key) {
  const upperKey = key?.toUpperCase().trim()
  if (!isValidFormat(upperKey)) {
    return { ok: false, error: 'Invalid key format. Expected: F2C-XXXX-XXXX-XXXX-XXXX or UUID format' }
  }

  const instance_id = getMachineId()
  const result = await callServer('/activate', { key: upperKey, instance_id })

  if (result === null) {
    // 网络不通，保存为 pending，下次联网时自动验证
    writeLicenseCache({
      key: upperKey,
      plan: 'pro',
      activatedAt: new Date().toISOString(),
      verifiedAt: null,
      status: 'pending',
    })
    return {
      ok: true,
      plan: 'pro',
      warning: 'Could not reach activation server. License saved locally, will verify when online.',
    }
  }

  if (!result.data?.ok) {
    return { ok: false, error: result.data?.error || 'Activation failed. Check your key and try again.' }
  }

  const { plan, email, activated_at } = result.data
  writeLicenseCache({
    key: upperKey,
    plan: plan || 'pro',
    email: email || '',
    activatedAt: activated_at || new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
    status: 'active',
  })

  return { ok: true, plan, email }
}

/**
 * 检查当前 license 状态（本地缓存优先，过期时重新验证）
 * 返回 { isPro, plan, key?, email?, status }
 */
export async function checkLicenseOnline() {
  const cache = readLicenseCache()
  if (!cache?.key || !isValidFormat(cache.key)) {
    return { isPro: false, plan: 'free' }
  }

  // 缓存未过期，直接用
  const verifiedAt = cache.verifiedAt ? new Date(cache.verifiedAt).getTime() : 0
  const cacheAge = Date.now() - verifiedAt
  if (cacheAge < CACHE_TTL_MS && cache.status === 'active') {
    return { isPro: true, plan: cache.plan || 'pro', key: maskKey(cache.key), email: cache.email || '', status: 'active' }
  }

  // 缓存过期或 pending，重新向服务端验证
  const instance_id = getMachineId()
  const result = await callServer('/verify', { key: cache.key, instance_id })

  if (result === null) {
    // 网络不通，继续信任本地缓存（最多 30 天宽限）
    const GRACE_TTL_MS = 30 * 24 * 60 * 60 * 1000
    if (cacheAge < GRACE_TTL_MS && cache.status !== 'revoked') {
      return { isPro: true, plan: cache.plan || 'pro', key: maskKey(cache.key), email: cache.email || '', status: 'offline_cached' }
    }
    return { isPro: false, plan: 'free', warning: 'Could not verify license (offline). Please connect to the internet.' }
  }

  if (!result.data?.ok) {
    // 服务端说无效（被吊销等）
    if (cache.status !== 'revoked') {
      writeLicenseCache({ ...cache, status: 'revoked', revokedAt: new Date().toISOString() })
    }
    return { isPro: false, plan: 'free', error: result.data?.error }
  }

  // 刷新缓存
  const { plan, email } = result.data
  writeLicenseCache({
    ...cache,
    plan: plan || cache.plan || 'pro',
    email: email || cache.email || '',
    verifiedAt: new Date().toISOString(),
    status: 'active',
  })
  return { isPro: true, plan: plan || 'pro', key: maskKey(cache.key), email: email || '', status: 'active' }
}

/**
 * 同步读取本地 license 状态（不发网络请求）
 * 用于 CLI 命令启动时的快速判断
 */
export function getLicenseStatus() {
  const cache = readLicenseCache()
  if (!cache?.key || !isValidFormat(cache.key)) {
    return { isPro: false, plan: 'free' }
  }
  return {
    isPro: cache.status === 'active' || cache.status === 'pending' || cache.status === 'offline_cached',
    plan: cache.plan || 'pro',
    key: maskKey(cache.key),
    email: cache.email || '',
    status: cache.status || 'unknown',
  }
}

// ── 门控检查 ──────────────────────────────────────────────────────────────────

/**
 * Pro 功能门控（同步，不发网络请求）
 */
export function requirePro(featureName) {
  const status = getLicenseStatus()
  if (!status.isPro) {
    const e = new Error(
      `"${featureName}" is a Pro feature.\n` +
      `  Upgrade at https://crazy-code.lemonsqueezy.com/checkout/buy/c9a7e28f-e69c-4431-8b88-2be69716635f\n` +
      `  Then run: f2c license activate <your-key>`
    )
    e.isLicenseError = true
    throw e
  }
}

/**
 * 免费版 link 数量门控（同步）
 */
export function checkLinkLimit(currentCount) {
  const status = getLicenseStatus()
  if (status.isPro) return
  if (currentCount >= FREE_LIMIT_LINKS) {
    const e = new Error(
      `Free plan is limited to ${FREE_LIMIT_LINKS} links.\n` +
      `  You currently have ${currentCount} links.\n` +
      `  Upgrade to Pro for unlimited links: https://crazy-code.lemonsqueezy.com/checkout/buy/c9a7e28f-e69c-4431-8b88-2be69716635f\n` +
      `  Then run: f2c license activate <your-key>`
    )
    e.isLicenseError = true
    throw e
  }
}

// ── 工具 ──────────────────────────────────────────────────────────────────────

function maskKey(key) {
  const p = key.split('-')
  return `${p[0]}-${p[1]}-****-****-${p[4]}`
}
