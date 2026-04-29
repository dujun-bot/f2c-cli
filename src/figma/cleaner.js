/**
 * Figma JSON 清洗器
 *
 * Figma 原始 JSON 极其冗余（几万行），直接喂给模型会：
 * 1. 超出 context window
 * 2. 引入大量噪音导致幻觉
 *
 * 这里提取关键的布局/样式/文字信息，生成轻量 DSL
 */

export function cleanNode(node, depth = 0) {
  if (!node) return null
  if (depth > 20) return null // 防止超深嵌套

  const result = {
    name: node.name,
    type: node.type,
  }

  // ── 布局（Auto Layout）──
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    result.layout = {
      direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
      gap: node.itemSpacing || 0,
      padding: extractPadding(node),
      align: mapAlignment(node.primaryAxisAlignItems, node.counterAxisAlignItems, node.layoutMode),
      wrap: node.layoutWrap === 'WRAP'
    }
  }

  // ── 尺寸 ──
  if (node.absoluteBoundingBox) {
    result.size = {
      width: Math.round(node.absoluteBoundingBox.width),
      height: Math.round(node.absoluteBoundingBox.height)
    }
  }

  // 尺寸模式（固定/自适应/填充）
  if (node.layoutSizingHorizontal || node.layoutSizingVertical) {
    result.sizing = {
      h: node.layoutSizingHorizontal || 'FIXED',
      v: node.layoutSizingVertical || 'FIXED'
    }
  }

  // ── 圆角 ──
  if (node.cornerRadius) result.borderRadius = node.cornerRadius
  if (node.rectangleCornerRadii) {
    result.borderRadius = node.rectangleCornerRadii
  }

  // ── 背景色 / fills ──
  const fillColor = extractFill(node.fills)
  if (fillColor) result.fill = fillColor

  // ── 描边 ──
  if (node.strokes?.length > 0 && node.strokeWeight) {
    const strokeColor = extractFill(node.strokes)
    if (strokeColor) {
      result.stroke = {
        color: strokeColor,
        width: node.strokeWeight
      }
    }
  }

  // ── 阴影 ──
  if (node.effects?.length > 0) {
    const shadows = node.effects
      .filter(e => e.type === 'DROP_SHADOW' && e.visible !== false)
      .map(e => ({
        x: e.offset?.x || 0,
        y: e.offset?.y || 0,
        blur: e.radius || 0,
        spread: e.spread || 0,
        color: rgbaToStr(e.color)
      }))
    if (shadows.length > 0) result.shadows = shadows
  }

  // ── 透明度 ──
  if (node.opacity !== undefined && node.opacity !== 1) {
    result.opacity = node.opacity
  }

  // ── 文字节点 ──
  if (node.type === 'TEXT') {
    result.text = node.characters || ''
    if (node.style) {
      result.textStyle = {
        fontSize: node.style.fontSize,
        fontWeight: node.style.fontWeight,
        lineHeight: node.style.lineHeightPx
          ? Math.round(node.style.lineHeightPx)
          : undefined,
        letterSpacing: node.style.letterSpacing || 0,
        textAlign: (node.style.textAlignHorizontal || 'LEFT').toLowerCase(),
        textDecoration: node.style.textDecoration || 'NONE',
        italic: node.style.italic || false
      }
    }
    // 文字颜色
    const textColor = extractFill(node.fills)
    if (textColor) result.textColor = textColor
    return result // 文字节点不需要处理子节点
  }

  // ── 图片节点 ──
  if (node.type === 'RECTANGLE' && node.fills?.some(f => f.type === 'IMAGE')) {
    result.isImage = true
  }

  // ── 矢量/图标节点 ──
  if (['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE'].includes(node.type)) {
    result.isIcon = true
    return result // 矢量不递归子节点
  }

  // ── 递归子节点 ──
  if (node.children?.length > 0) {
    const children = node.children
      .filter(child => child.visible !== false) // 跳过隐藏节点
      .map(child => cleanNode(child, depth + 1))
      .filter(Boolean)
    if (children.length > 0) result.children = children
  }

  return result
}

// ── 工具函数 ──

function extractPadding(node) {
  const top = node.paddingTop || 0
  const right = node.paddingRight || 0
  const bottom = node.paddingBottom || 0
  const left = node.paddingLeft || 0
  if (top === right && right === bottom && bottom === left) return top
  if (top === bottom && left === right) return `${top} ${right}`
  return { top, right, bottom, left }
}

function mapAlignment(primary, counter, mode) {
  const map = {
    MIN: 'start',
    CENTER: 'center',
    MAX: 'end',
    SPACE_BETWEEN: 'space-between',
    BASELINE: 'baseline'
  }
  const justify = map[primary] || 'start'
  const align = map[counter] || 'start'
  if (mode === 'HORIZONTAL') return { justifyContent: justify, alignItems: align }
  return { justifyContent: justify, alignItems: align }
}

function extractFill(fills) {
  if (!fills?.length) return null
  const solidFill = fills.find(f => f.type === 'SOLID' && f.visible !== false)
  if (!solidFill) return null
  return rgbaToStr(solidFill.color, solidFill.opacity)
}

function rgbaToStr(color, opacity) {
  if (!color) return null
  const r = Math.round((color.r || 0) * 255)
  const g = Math.round((color.g || 0) * 255)
  const b = Math.round((color.b || 0) * 255)
  const a = opacity !== undefined ? opacity : (color.a !== undefined ? color.a : 1)
  if (a === 1) return `rgb(${r},${g},${b})`
  return `rgba(${r},${g},${b},${parseFloat(a.toFixed(2))})`
}
