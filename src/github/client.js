/**
 * GitHub REST API 客户端
 * 用于：获取文件内容、创建分支、提交代码、创建 PR
 */

const GITHUB_API = 'https://api.github.com'

function headers(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  }
}

async function request(method, path, token, body = null) {
  const opts = {
    method,
    headers: headers(token),
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${GITHUB_API}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(`GitHub API ${method} ${path} => ${res.status}: ${err.message}`)
  }
  if (res.status === 204) return null
  return res.json()
}

/**
 * 获取仓库默认分支名
 */
export async function getDefaultBranch(token, repo) {
  const data = await request('GET', `/repos/${repo}`, token)
  return data.default_branch
}

/**
 * 获取分支最新 commit SHA
 */
export async function getBranchSha(token, repo, branch) {
  const data = await request('GET', `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token)
  return data.object.sha
}

/**
 * 检查分支是否存在
 */
export async function branchExists(token, repo, branch) {
  try {
    await request('GET', `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token)
    return true
  } catch {
    return false
  }
}

/**
 * 创建新分支
 */
export async function createBranch(token, repo, branchName, fromSha) {
  await request('POST', `/repos/${repo}/git/refs`, token, {
    ref: `refs/heads/${branchName}`,
    sha: fromSha
  })
}

/**
 * 获取文件内容（Base64），不存在返回 null
 */
export async function getFileContent(token, repo, filePath, branch) {
  try {
    const data = await request('GET', `/repos/${repo}/contents/${filePath}?ref=${branch}`, token)
    return { content: Buffer.from(data.content, 'base64').toString('utf-8'), sha: data.sha }
  } catch (e) {
    if (e.message.includes('404')) return null
    throw e
  }
}

/**
 * 创建或更新文件（单文件提交）
 */
export async function putFile(token, repo, filePath, content, message, branch, existingSha = null) {
  const body = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch,
  }
  if (existingSha) body.sha = existingSha
  await request('PUT', `/repos/${repo}/contents/${filePath}`, token, body)
}

/**
 * 创建 Pull Request
 * 返回 PR URL
 */
export async function createPR(token, repo, { title, body, head, base }) {
  const data = await request('POST', `/repos/${repo}/pulls`, token, {
    title,
    body,
    head,
    base,
    draft: false
  })
  return data.html_url
}

/**
 * 检查是否已存在同名 head 的 open PR
 */
export async function findOpenPR(token, repo, head) {
  try {
    const data = await request('GET', `/repos/${repo}/pulls?state=open&head=${repo.split('/')[0]}:${head}`, token)
    return data.length > 0 ? data[0].html_url : null
  } catch {
    return null
  }
}

/**
 * 验证 token 和 repo 权限
 */
export async function validateAccess(token, repo) {
  try {
    const data = await request('GET', `/repos/${repo}`, token)
    const canPush = data.permissions?.push || data.permissions?.admin
    return { ok: true, defaultBranch: data.default_branch, canPush }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
