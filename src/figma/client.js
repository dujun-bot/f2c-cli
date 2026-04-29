import axios from 'axios'

const FIGMA_API = 'https://api.figma.com/v1'

function figmaHeaders(token) {
  return { 'X-Figma-Token': token }
}

/**
 * 拉取单个节点数据
 */
export async function fetchNode(token, fileKey, nodeId) {
  const res = await axios.get(
    `${FIGMA_API}/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
    { headers: figmaHeaders(token) }
  )
  const node = res.data.nodes[nodeId]
  if (!node) throw new Error(`Node ${nodeId} not found in file ${fileKey}`)
  return node.document
}

/**
 * 拉取文件的顶层页面和Frame列表（用于browse命令）
 */
export async function fetchFilePages(token, fileKey) {
  const res = await axios.get(
    `${FIGMA_API}/files/${fileKey}?depth=2`,
    { headers: figmaHeaders(token) }
  )
  const pages = res.data.document.children || []
  return pages.map(page => ({
    pageId: page.id,
    pageName: page.name,
    frames: (page.children || [])
      .filter(n => n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'COMPONENT_SET')
      .map(n => ({ id: n.id, name: n.name, type: n.type }))
  }))
}

/**
 * 拉取文件元信息
 */
export async function fetchFileMeta(token, fileKey) {
  const res = await axios.get(
    `${FIGMA_API}/files/${fileKey}?depth=1`,
    { headers: figmaHeaders(token) }
  )
  return {
    name: res.data.name,
    lastModified: res.data.lastModified
  }
}
