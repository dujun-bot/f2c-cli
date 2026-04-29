/**
 * Figma URL 解析
 * 支持以下格式:
 *   https://www.figma.com/file/ABC123/FileName?node-id=12-345
 *   https://www.figma.com/design/ABC123/FileName?node-id=12%3A345
 *   https://www.figma.com/file/ABC123/FileName (无节点，拉整个文件)
 */
export function parseFigmaUrl(url) {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)

    // pathname: /file/ABC123/FileName  或  /design/ABC123/FileName
    const typeIndex = parts.findIndex(p => p === 'file' || p === 'design')
    if (typeIndex === -1) throw new Error('Not a valid Figma URL')

    const fileKey = parts[typeIndex + 1]
    if (!fileKey) throw new Error('Cannot extract file key from URL')

    // node-id: 可能是 12-345 或 12%3A345 (URL编码的 12:345)
    let nodeId = u.searchParams.get('node-id') || ''
    // Figma API 用冒号分隔，URL里可能是短横线
    nodeId = nodeId.replace(/-/g, ':')

    return { fileKey, nodeId: nodeId || null }
  } catch (e) {
    throw new Error(`Invalid Figma URL: ${e.message}`)
  }
}
