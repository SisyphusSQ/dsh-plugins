/**
 * Wrap the compiled browser bundle in the publish-time loader contract.
 *
 * The Web client materializes a package's `./client` entry through
 * `window.__ModuleLoader__.load({ id, factory })`, so the emitted CJS has to
 * be handed to that queue instead of being shipped as a bare module. The id
 * must equal the package name, because that is what `dsh.client` resolution
 * looks up.
 *
 * This plugin carries no stylesheet (the settings row styles itself from
 * `--dsw-*` tokens inline), so a missing `style.css` is expected rather than
 * an error; the CSS branch stays for parity with the wrapper the other
 * packages in this repository use.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const pluginId = manifest.name

if (typeof pluginId !== 'string' || pluginId.length === 0) {
  throw new TypeError('package.json must declare a non-empty package name')
}

const compiledPath = join(root, '.client-build', 'index.cjs')
const compiledCssPath = join(root, '.client-build', 'style.css')
const outputPath = join(root, 'lib', 'client.js')
const [source, css] = await Promise.all([
  readFile(compiledPath, 'utf8'),
  readFile(compiledCssPath, 'utf8').catch(() => ''),
])
const cssId = `${pluginId}/style.css`
const wrapped = [
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(pluginId)}, factory: (require) => {`,
  'var module = { exports: {} }; var exports = module.exports;',
  `const css = ${JSON.stringify(css)};`,
  `const cssId = ${JSON.stringify(cssId)};`,
  'if (css.length > 0 && typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(cssId) + "]") === null) {',
  '  const tag = document.createElement("style");',
  `  tag.dataset.plugin = ${JSON.stringify(pluginId)};`,
  '  tag.dataset.pluginCss = cssId;',
  '  tag.textContent = css;',
  '  document.head.appendChild(tag);',
  '}',
  source.replace(/\n?\/\/# sourceMappingURL=.*$/u, ''),
  'return module.exports; } });',
  '',
].join('\n')

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, wrapped)
await rm(join(root, '.client-build'), { recursive: true, force: true })
