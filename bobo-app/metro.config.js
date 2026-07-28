const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')
const packagesRoot = path.join(workspaceRoot, 'packages')

const config = getDefaultConfig(projectRoot)
const zustandRoot = path.dirname(require.resolve('zustand/package.json'))
const moduleAliases = new Map([
  ['zustand', path.join(zustandRoot, 'index.js')],
  ['zustand/vanilla', path.join(zustandRoot, 'vanilla.js')],
  ['zustand/middleware', path.join(zustandRoot, 'middleware.js')],
])

config.watchFolders = Array.from(
  new Set([...(config.watchFolders || []), packagesRoot])
)

// Expo web exports a classic script bundle. Prefer CommonJS dependency
// entrypoints for Zustand so its import.meta.env checks do not reach the browser.
config.resolver.resolveRequest = (context, moduleName, platform) =>
  context.resolveRequest(
    context,
    moduleAliases.get(moduleName) ?? moduleName,
    platform
  )

module.exports = config
