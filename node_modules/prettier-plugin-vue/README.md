# prettier-plugin-vue

[![test](https://img.shields.io/github/actions/workflow/status/voqse/prettier-plugin-vue/test.yml?branch=master&label=test)](https://github.com/voqse/prettier-plugin-vue/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/prettier-plugin-vue)](https://www.npmjs.com/package/prettier-plugin-vue)

A lightweight plugin that allows [Prettier](https://prettier.io/) to ignore certain blocks of Vue Single File Components (SFCs) independently of the IDE and its plugins. This can be useful if you want to setup Prettier in combination with other linters such as `eslint` or `stylelint`.

## Installation
To get started, just install prettier-plugin-vue as a dev-dependency:
```shell
npm install prettier prettier-plugin-vue --save-dev
```

This plugin follows Prettier’s autoloading convention, so as long as you’ve got Prettier set up in your project, it’ll start working automatically as soon as it’s installed.

*Note that plugin autoloading is not supported when using certain package managers, such as pnpm or Yarn PnP. In this case you may need to add the plugin to your Prettier config explicitly:*

```javascript
// prettier.config.js
module.exports = {
  plugins: [require('prettier-plugin-vue')],
}
```

## Configuration
### vueExcludeBlocks
Allows you to specify a list of blocks `strings` to ignore while formatting Vue SFC files.

| Default     | CLI Override                    | API Override                 |
|-------------|---------------------------------|------------------------------|
| `['style']` | `--vue-exclude-blocks <string>` | `vueExcludeBlocks: <string>` |

*Note that by default this plugin ignores `<style>` blocks to avoid interfering with stylelint.*

### Example `.prettierrc`
```javascript
{
  vueExcludeBlocks: ["style", "template"]
}
```
