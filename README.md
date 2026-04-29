# f2c-cli — Figma to Code

> Convert Figma designs to React/Vue components automatically via AI.
> Your API key, your cost. We just provide the tool.

## Install

```bash
npm install -g f2c-cli
```

## Quick Start

```bash
# 1. One-time setup (Figma token + AI API key)
f2c init

# 2. Convert a Figma component to code
f2c convert --url "https://www.figma.com/design/xxx?node-id=1-2"

# 3. Interactive browser — pick any component visually
f2c browse
```

## Commands

| Command | Description |
|---------|-------------|
| `f2c init` | First-time setup wizard |
| `f2c convert --url <url>` | Convert a Figma node to a component |
| `f2c browse` | Interactively browse and pick components |
| `f2c config` | View current configuration |
| `f2c config --provider <p>` | Switch AI provider (claude/openai/ollama) |
| `f2c link --url <url>` | Link a Figma node to a local file path |
| `f2c sync` | Detect Figma changes and create GitHub PRs *(Pro)* |
| `f2c watch` | Auto-sync on Figma change *(Pro)* |
| `f2c license activate <key>` | Activate Pro license |
| `f2c license status` | Show current license status |

## Convert Options

```bash
f2c convert \
  --url "https://figma.com/..." \
  --framework vue          # react (default) | vue
  --out ./src/components   # override output directory
  --css tailwind           # tailwind (default) | cssmodules | plain
  --ts                     # force TypeScript output
```

## Free vs Pro

| Feature | Free | Pro |
|---------|------|-----|
| `f2c convert` (local output) | ✓ up to 3 links | ✓ unlimited |
| React + Vue output | ✓ | ✓ |
| `f2c sync` (GitHub PR) | — | ✓ |
| `f2c watch` (auto-sync) | — | ✓ |

Get Pro: https://f2c.dev/pro

## AI Providers

| Provider | Model | Notes |
|----------|-------|-------|
| Claude (default) | claude-sonnet | Best output quality |
| OpenAI | gpt-4o | Good alternative |
| Ollama | codellama | Free, runs locally |

## How to get your Figma URL

1. Open Figma (web or desktop)
2. Right-click any layer/frame/component
3. Click "Copy link to selection"
4. Paste into `f2c convert --url "..."`

## Project config

Create `.f2crc` in your project root to override global settings:

```json
{
  "output": {
    "framework": "vue",
    "css": "tailwind",
    "dir": "./src/components",
    "typescript": true
  }
}
```
