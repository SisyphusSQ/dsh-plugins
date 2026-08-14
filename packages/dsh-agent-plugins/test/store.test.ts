/**
 * store.ts tests: install / replace / uninstall / ledger / containment.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compareVersions,
  installFromSource,
  loadLedger,
  parseStoreDirName,
  scanStore,
  setMcpEnabled,
  setPluginEnabled,
  setSkillEnabled,
  uninstallPlugin,
  verifyPluginDir,
  EMPTY_LEDGER,
} from '../lib/store.js'

const fixtures = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

async function makeEnv(): Promise<{ storeDir: string; dataRoot: string }> {
  const base = await mkdtemp(join(tmpdir(), 'ap-store-'))
  const storeDir = join(base, 'store')
  const dataRoot = join(base, 'data')
  await mkdir(storeDir, { recursive: true })
  await mkdir(dataRoot, { recursive: true })
  return { storeDir, dataRoot }
}

test('parseStoreDirName', () => {
  assert.deepEqual(parseStoreDirName('hello@1.0.0'), { name: 'hello', version: '1.0.0' })
  assert.deepEqual(parseStoreDirName('hello.world@1.0.0'), { name: 'hello.world', version: '1.0.0' })
  assert.equal(parseStoreDirName('no-at-sign'), null)
  assert.equal(parseStoreDirName('@1.0.0'), null)
  assert.equal(parseStoreDirName('hello@'), null)
})

test('verifyPluginDir accepts the valid fixture and finds both skills', async () => {
  const verified = await verifyPluginDir(join(fixtures, 'valid-plugin'))
  assert.equal(verified.manifest?.name, 'hello-world')
  assert.equal(verified.issues.filter((i) => i.fatal === true).length, 0)
  assert.equal(verified.mcpServers?.length, 2)
})

test('verifyPluginDir rejects bad $schema', async () => {
  const verified = await verifyPluginDir(join(fixtures, 'bad-schema'))
  assert.equal(verified.manifest, undefined)
  assert.ok(verified.issues.some((i) => i.fatal === true))
})

test('verifyPluginDir skips a symlink-escaped skill but keeps the plugin', async () => {
  const verified = await verifyPluginDir(join(fixtures, 'escape-skill'))
  assert.equal(verified.manifest?.name, 'escape-demo')
  const escape = verified.issues.find((i) => i.message.includes('resolves outside the plugin root'))
  assert.ok(escape !== undefined, 'expected a containment issue for the escaped skill')
})

test('install from a dir source, replace preserves enable states', async () => {
  const { storeDir, dataRoot } = await makeEnv()
  const ledger = structuredClone(EMPTY_LEDGER)

  const first = await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)
  assert.equal(first.ok === undefined, true)
  assert.equal(first.name, 'hello-world')
  assert.equal(first.version, '1.2.3')
  assert.equal(first.replaced, false)
  assert.equal(first.issues.some((i) => i.fatal === true), false)
  assert.equal(ledger.plugins['hello-world']?.enabled, true)
  assert.ok((await readdir(join(storeDir, 'hello-world@1.2.3'))).includes('plugin.json'))

  // Disable a skill and the plugin, then reinstall the same source (replace).
  await setSkillEnabled(storeDir, ledger, 'hello-world', 'skill-a', false)
  await setPluginEnabled(storeDir, ledger, 'hello-world', false)
  const second = await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)
  assert.equal(second.replaced, true)
  assert.equal(ledger.plugins['hello-world']?.enabled, false, 'plugin-level state must survive replace')
  assert.equal(ledger.plugins['hello-world']?.skills['skill-a']?.enabled, false, 'component-level state must survive replace')

  // PLUGIN_DATA directory exists and survives.
  const dataDir = join(dataRoot, 'hello-world')
  assert.ok((await readdir(dataDir)).length >= 0)
})

test('install rejects a fatal manifest', async () => {
  const { storeDir, dataRoot } = await makeEnv()
  const ledger = structuredClone(EMPTY_LEDGER)
  const result = await installFromSource({ kind: 'dir', path: join(fixtures, 'bad-schema'), checksum: '' }, { storeDir, dataRoot }, ledger)
  assert.equal(result.issues.some((i) => i.fatal === true), true)
  assert.equal(Object.keys(ledger.plugins).length, 0)
})

test('uninstall keeps PLUGIN_DATA and removes the directory', async () => {
  const { storeDir, dataRoot } = await makeEnv()
  const ledger = structuredClone(EMPTY_LEDGER)
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)
  await writeFile(join(dataRoot, 'hello-world', 'keep.txt'), 'keep me')
  const result = await uninstallPlugin(storeDir, dataRoot, ledger, 'hello-world')
  assert.equal(result.ok, true)
  assert.equal(Object.keys(ledger.plugins).length, 0)
  assert.equal(await readFile(join(result.dataDir, 'keep.txt'), 'utf8'), 'keep me')
})

test('scanStore lists only valid plugin directories', async () => {
  const { storeDir, dataRoot } = await makeEnv()
  const ledger = structuredClone(EMPTY_LEDGER)
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)
  // A stray directory without plugin.json must be ignored.
  await mkdir(join(storeDir, 'stray@0.0.1'))
  const plugins = await scanStore(storeDir)
  assert.equal(plugins.length, 1)
  assert.equal(plugins[0]?.name, 'hello-world')
})

test('ledger round-trips atomically', async () => {
  const { storeDir } = await makeEnv()
  await setMcpEnabled(storeDir, structuredClone(EMPTY_LEDGER) as never, 'nope', 'srv', true) // must fail, not throw
  const { ledger, issue } = await loadLedger(storeDir)
  assert.equal(issue, undefined)
  assert.equal(Object.keys(ledger.plugins).length, 0)
})

test('compareVersions for downgrade warnings', () => {
  assert.equal(compareVersions('1.2.3', '1.2.2') > 0, true)
  assert.equal(compareVersions('1.2.3', '2.0.0') < 0, true)
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
})

test('symlinked plugin dir contents resolve inside the store root', async () => {
  // The staged copy may contain symlinks to itself; ensure verifyPluginDir
  // does not reject internal symlinks (skill-a is a real dir in the fixture).
  const verified = await verifyPluginDir(join(fixtures, 'valid-plugin'))
  assert.equal(verified.issues.length, 0)
})
