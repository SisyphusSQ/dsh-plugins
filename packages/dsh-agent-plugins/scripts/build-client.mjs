/**
 * Build the client half into the DSH client-module bundle format:
 *
 *   window.__ModuleLoader__.load({
 *     id: "<package-name>",
 *     factory: (require) => {
 *       var module = { exports: {} };
 *       var exports = module.exports;
 *       <bundled code, externalized requires for react + @deepseek-ai/*>
 *       return module.exports;
 *     }
 *   })
 *
 * The Node half (dsh-client-modules) only hashes and hosts the built bundle,
 * so this format is a publish-time contract (see docs/design/dsh-agent-plugins.md).
 */
import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const tmp = join(root, 'lib', '.client-bundle.js')
const out = join(root, 'lib', 'client.js')

mkdirSync(dirname(out), { recursive: true })

await build({
  entryPoints: [join(root, 'src', 'client', 'index.tsx')],
  outfile: tmp,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  // Every dependency is provided at runtime by the client module loader:
  // react via the shell's static registry, @deepseek-ai/* via registered
  // factories. Type-only imports vanish at build time.
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/*'],
  sourcemap: false,
  logLevel: 'warning',
})

const bundle = readFileSync(tmp, 'utf8')
const wrapper = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(pkg.name)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${bundle}
\t\treturn module.exports;
\t}
});
`
writeFileSync(out, wrapper)
rmSync(tmp, { force: true })
console.log(`built ${out} (${wrapper.length} bytes)`)
