#!/usr/bin/env node
/**
 * 快速测试脚本 — 验证 Figma Token 和完整链路
 * 用法: node test-figma.js <figma-url>
 */
import { parseFigmaUrl } from './src/figma/parser.js'
import { fetchNode } from './src/figma/client.js'
import { cleanNode } from './src/figma/cleaner.js'
import { generateCode } from './src/ai/client.js'
import { writeComponent, toComponentName } from './src/generator/writer.js'
import { loadConfig, updateConfig } from './src/utils/config.js'
import path from 'path'
import os from 'os'

const url = process.argv[2]
if (!url) {
  console.error('Usage: node test-figma.js <figma-node-url>')
  process.exit(1)
}

// 如果传了第三个参数，当作 Figma Token
const figmaToken = process.argv[3]
if (figmaToken) {
  updateConfig({ figma: { token: figmaToken } })
  console.log('Figma token updated.')
}

const config = loadConfig()
if (!config.figma.token) {
  console.error('No Figma token. Run: node test-figma.js <url> <your-figma-token>')
  process.exit(1)
}

console.log('\n=== f2c End-to-End Test ===\n')

try {
  // Step 1: Parse URL
  const { fileKey, nodeId } = parseFigmaUrl(url)
  console.log('File Key:', fileKey)
  console.log('Node ID: ', nodeId)

  // Step 2: Fetch from Figma
  console.log('\nFetching from Figma API...')
  const rawNode = await fetchNode(config.figma.token, fileKey, nodeId)
  console.log('Node name:', rawNode.name)
  console.log('Node type:', rawNode.type)
  console.log('Raw JSON size:', JSON.stringify(rawNode).length, 'bytes')

  // Step 3: Clean
  console.log('\nCleaning JSON...')
  const cleaned = cleanNode(rawNode)
  const cleanedStr = JSON.stringify(cleaned, null, 2)
  console.log('Cleaned JSON size:', cleanedStr.length, 'bytes')
  console.log('Estimated tokens:', Math.round(cleanedStr.length / 4))

  // Step 4: Generate code
  console.log('\nGenerating React component...')
  const code = await generateCode(cleaned, config)
  console.log('Code length:', code.length, 'chars')

  // Step 5: Write file
  const componentName = toComponentName(rawNode.name)
  const outDir = path.join(os.homedir(), 'Desktop', 'f2c-test-output')
  const result = await writeComponent(code, componentName, outDir, config.output)

  console.log('\n=== SUCCESS ===')
  console.log('Component:', componentName)
  console.log('Output:', result.filePath)
  console.log('\nFirst 200 chars of generated code:')
  console.log(code.slice(0, 200))

} catch (e) {
  console.error('\n=== ERROR ===')
  console.error(e.message)
  if (e.response?.data) console.error(JSON.stringify(e.response.data))
  process.exit(1)
}
