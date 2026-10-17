import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, relative, dirname, extname } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(process.argv[2] ?? '')
assert.ok(process.argv[2], 'Pass the extracted package directory')
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const files = []
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) await walk(path)
    else files.push(path)
  }
}
await walk(root)
for (const file of files) {
  const name = relative(root, file)
  assert.ok(!/^(src|tests|scripts|\.client-build)\//.test(name), `Unexpected build input ${name}`)
  assert.ok(!/(^|\/)(auth\.json|\.npmrc|credentials|sessions)(\/|$)/i.test(name), `Forbidden payload ${name}`)
  if (extname(file) !== '.js') continue
  const code = await readFile(file, 'utf8')
  assert.ok(!code.includes('/Users/'), `Private absolute path in ${name}`)
  for (const match of code.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(file), match[1])
    assert.ok(files.includes(target), `Missing runtime relative import ${name}: ${match[1]}`)
  }
}
for (const name of ['README.md', 'README.zh.md']) {
  const text = await readFile(resolve(root, name), 'utf8')
  for (const match of text.matchAll(/\]\(<([^>]+)>\)/g)) {
    if (/^https?:/.test(match[1])) continue
    assert.ok(files.includes(resolve(root, match[1])), `Broken packaged documentation link ${name}: ${match[1]}`)
  }
}
assert.ok(files.includes(resolve(root, manifest.dsh.bundle.patch)))
assert.ok(files.includes(resolve(root, 'dsh-plugin.naming.json')))
const host = await import(pathToFileURL(resolve(root, manifest.exports['.'].default)).href)
assert.equal(typeof host.apply, 'function')
assert.equal('default' in host, false)
const { scanHome } = await import(pathToFileURL(resolve(root, manifest.exports['./catalog'].default)).href)
const catalog = await scanHome({ home: '/missing-disabled-home', enabled: false })
assert.equal(catalog.skills.length, 0)
assert.equal(catalog.diagnostics.length, 0)
console.log(`Artifact audit passed: ${files.length} packaged files, runtime imports, exports and documentation links. Consumer dependencies were linked to the exact workspace cohort; this is not an installed-profile/product E2E.`)
