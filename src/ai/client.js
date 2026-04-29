import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

/**
 * 统一的AI调用接口
 * 内部按 provider 路由，对外接口完全一致
 */
export async function generateCode(cleanedJson, config) {
  const { provider, apiKey, baseURL, model } = config.ai
  const { css, typescript, framework = 'react' } = config.output
  const ext = typescript ? 'tsx' : 'jsx'

  const prompt = framework === 'vue'
    ? buildVuePrompt(cleanedJson, { css, typescript })
    : buildReactPrompt(cleanedJson, { css, ext })

  switch (provider) {
    case 'claude':
      return callClaude({ apiKey, baseURL, model }, prompt)
    case 'openai':
      return callOpenAI({ apiKey, baseURL, model }, prompt)
    case 'ollama':
      return callOllama({ baseURL, model }, prompt)
    default:
      throw new Error(`Unknown AI provider: ${provider}`)
  }
}

// ── Prompt 构建 ──

function buildReactPrompt(cleanedJson, { css, ext }) {
  const cssInstructions = {
    tailwind: 'Use Tailwind CSS utility classes for ALL styling. NEVER use inline style={{}} for static values — always use Tailwind arbitrary values instead (e.g. bg-[#0d0d0d], text-[#333], w-[120px], p-[16px], gap-[8px], rounded-[6px]). Only use style={{}} for truly dynamic values passed as props (e.g. style={{ width: props.width }}). Map padding/gap/size to Tailwind arbitrary values, not inline styles. Add hover: and active: Tailwind pseudo-class variants on interactive elements (button, a, input) for hover/active states.',
    cssmodules: 'Use CSS Modules. Output two code blocks: one for the component (.tsx/.jsx) and one for the styles (.module.css). Use camelCase class names. Include :hover and :active rules in the CSS file.',
    plain: 'Use plain inline styles (style={{}} props). Convert all colors and dimensions to inline style objects. Handle hover/active via onMouseEnter/onMouseLeave state.'
  }

  const tsNote = ext === 'tsx'
    ? 'Use TypeScript. Add proper prop types with an interface definition.'
    : 'Use JavaScript (no TypeScript).'

  return `You are a senior frontend developer. Convert the following Figma component structure into a production-ready React component.

Rules:
- Output ONLY the complete component code, no explanations, no markdown fences
- ${tsNote}
- ${cssInstructions[css] || cssInstructions.tailwind}
- Use functional component with arrow function syntax
- Component name should be derived from the "name" field (PascalCase, no spaces)
- Always include a "className" prop (string, default "") merged onto the root element's className so callers can extend styles
- Name text-content props semantically: use "label" for button/badge text, "title" for headings, "text" for generic body text
- For interactive elements add hover: and active: Tailwind classes (e.g. hover:opacity-85 active:opacity-70)
- Handle text nodes as <span> or <p> based on context
- Handle image nodes as <img> with alt text from name
- Handle icon nodes as <svg> placeholder with a comment
- Make the component self-contained (no external dependencies except React)
- If layout.direction is "row", use flexbox row; if "column", use flexbox column
- Map layout.gap to gap, layout.padding to padding
- Map fill to backgroundColor
- Map stroke to border
- Map shadows to boxShadow
- Map borderRadius to borderRadius

Figma component structure (simplified DSL):
${JSON.stringify(cleanedJson, null, 2)}

Output the complete React component code:`
}

function buildVuePrompt(cleanedJson, { css, typescript }) {
  const cssInstructions = {
    tailwind: 'Use Tailwind CSS utility classes for ALL styling. NEVER use :style bindings for static values — always use Tailwind arbitrary values instead (e.g. bg-[#0d0d0d], text-[#333], w-[120px], p-[16px], gap-[8px], rounded-[6px]). Only use :style for truly dynamic values passed as props (e.g. :style="{ width: props.width }"). Map padding/gap/size to Tailwind arbitrary values, not inline styles. Add hover: and active: Tailwind pseudo-class variants on interactive elements.',
    cssmodules: 'Use scoped <style> block with CSS classes. Use camelCase class names in <script> and kebab-case in <template>. Include :hover and :active rules.',
    plain: 'Use scoped <style> block with plain CSS. Convert all Figma colors and dimensions to CSS properties. Include :hover and :active rules.'
  }

  const tsNote = typescript
    ? 'Use TypeScript in <script setup lang="ts">. Define props with interface + withDefaults(defineProps<Props>(), { ... }) pattern. NEVER pass default values directly to defineProps<Props>() — always use withDefaults wrapper.'
    : 'Use JavaScript in <script setup>. Define props with defineProps({}).'

  return `You are a senior frontend developer. Convert the following Figma component structure into a production-ready Vue 3 component using <script setup> Composition API syntax.

Rules:
- Output ONLY the complete .vue single-file component code, no explanations, no markdown fences
- Use Vue 3 <script setup>${typescript ? ' lang="ts"' : ''} syntax (NOT Options API)
- ${tsNote}
- ${cssInstructions[css] || cssInstructions.tailwind}
- Component name should be derived from the "name" field (PascalCase, no spaces)
- Use <template>, <script setup>, and <style scoped> blocks in that order
- Always accept a "class" attribute via Vue's $attrs fallthrough (let Vue handle it automatically, do NOT add inheritAttrs: false unless strictly necessary)
- Name text-content props semantically: use "label" for button/badge text, "title" for headings, "text" for generic body text
- HOVER/ACTIVE STATE RULE — pick ONE approach, never mix:
  - If CSS-only is sufficient (simple color/opacity changes): use Tailwind hover:/active: classes ONLY, no ref(), no scoped CSS duplication
  - If logic is needed (toggle, selected, disabled): use ref() + :class binding ONLY, no redundant scoped CSS
  - Never define a ref() that is not actually read in <template>
- Handle text nodes as <span> or <p> based on context
- Handle image nodes as <img> with alt from name
- Handle icon nodes as <svg> placeholder with a comment
- Make the component self-contained (no external dependencies except Vue)
- If layout.direction is "row", use flexbox row; if "column", use flexbox column
- Map layout.gap to gap, layout.padding to padding
- Map fill to backgroundColor
- Map stroke to border
- Map shadows to box-shadow
- Map borderRadius to border-radius
- Only add <script setup> block if there are actual props or reactive logic; omit it for purely presentational components
- Only import Vue APIs (ref, computed, etc.) that are actually used

Figma component structure (simplified DSL):
${JSON.stringify(cleanedJson, null, 2)}

Output the complete Vue 3 SFC component code:`
}

// ── Provider 实现 ──

async function callClaude({ apiKey, baseURL, model }, prompt) {
  const clientOptions = { apiKey }
  if (baseURL) clientOptions.baseURL = baseURL

  const client = new Anthropic(clientOptions)
  const msg = await client.messages.create({
    model: model || 'claude-opus-4-6',
    max_tokens: 8096,
    messages: [{ role: 'user', content: prompt }]
  })

  return msg.content[0].text
}

async function callOpenAI({ apiKey, baseURL, model }, prompt) {
  const clientOptions = { apiKey }
  if (baseURL) clientOptions.baseURL = baseURL

  const client = new OpenAI(clientOptions)
  const res = await client.chat.completions.create({
    model: model || 'gpt-4o',
    max_tokens: 8096,
    messages: [{ role: 'user', content: prompt }]
  })

  return res.choices[0].message.content
}

async function callOllama({ baseURL, model }, prompt) {
  const base = baseURL || 'http://localhost:11434'
  const res = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'codellama',
      prompt,
      stream: false
    })
  })
  const data = await res.json()
  return data.response
}
