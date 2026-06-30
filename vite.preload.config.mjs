import { defineConfig } from 'vite'
import { builtinModules, createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

const external = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  ...Object.keys(pkg.dependencies || {})
]

export default defineConfig({
  build: {
    rollupOptions: { external }
  }
})
