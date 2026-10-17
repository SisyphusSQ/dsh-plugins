import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
test('published browser wrapper loads without importing Home/process adapters', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.ok(!/require\(["'](?:node:|@deepseek-ai\/dsh-mcp-client)/u.test(source))
  let contribution
  runInNewContext(source, { window: { __ModuleLoader__: { load: row => { contribution = row } } } })
  assert.equal(contribution.id, '@suqingsq/dsh-codex-bridge')
  const module = contribution.factory(require)
  assert.equal(module.name, 'dsh-codex-bridge')
  assert.equal(typeof module.apply, 'function')
  assert.deepEqual(Array.from(module.inject), ['slots', 'locale', 'remote', 'configForms'])
})
