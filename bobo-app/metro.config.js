const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)
const zustandRoot = path.dirname(require.resolve('zustand/package.json'))
const zustandCommonJsEntries = new Map([
  ['zustand', path.join(zustandRoot, 'index.js')],
  ['zustand/vanilla', path.join(zustandRoot, 'vanilla.js')],
  ['zustand/middleware', path.join(zustandRoot, 'middleware.js')],
])

// Expo web exports a classic script bundle. Prefer CommonJS dependency
// entrypoints for Zustand so its import.meta.env checks do not reach the browser.
config.resolver.resolveRequest = (context, moduleName, platform) =>
  context.resolveRequest(
    context,
    zustandCommonJsEntries.get(moduleName) ?? moduleName,
    platform
  )

module.exports = config
