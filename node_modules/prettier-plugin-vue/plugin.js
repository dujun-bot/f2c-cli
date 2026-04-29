const { vue: vueParser } = require('prettier/parser-html').parsers

const excludeDefaults = ['style']
const excludeNodeType = 'vue-excluded-content'

let defaultHtmlPrinter

const pluginOptions = {
  vueExcludeBlocks: {
    type: 'string',
    category: 'Vue',
    array: true,
    default: [{ value: excludeDefaults }],
    description: 'Ignore this blocks while formatting Vue SFC files.',
  },
}

function printOriginal(node, options) {
  const { originalText } = options
  const { start, end } = node.sourceSpan

  return originalText.slice(start.offset, end.offset)
}

function collapseChildren({ children }) {
  if (!children.length) {
    return children
  }

  const { start } = children[0].sourceSpan
  const { end } = children[children.length - 1].sourceSpan

  return [
    {
      sourceSpan: { start, end },
      type: excludeNodeType,
    },
  ]
}

function extendPrinter(defaultPrint) {
  return (path, options, print) => {
    const { vueExcludeBlocks } = options
    const node = path.getValue()

    if (node.parent && node.parent.type === 'root' && vueExcludeBlocks.includes(node.name)) {
      node.children = collapseChildren(node)
    }

    if (node.type === excludeNodeType) {
      return printOriginal(node, options).trim()
    }

    return defaultPrint(path, options, print)
  }
}

function preprocess(text, options) {
  if (!defaultHtmlPrinter) {
    defaultHtmlPrinter = options.plugins.find(({ printers }) => printers.html).printers.html

    if (defaultHtmlPrinter) {
      defaultHtmlPrinter.print = extendPrinter(defaultHtmlPrinter.print)
    }
  }

  return text
}

module.exports = {
  parsers: {
    vue: Object.assign(vueParser, { preprocess }),
  },
  options: pluginOptions,
}
