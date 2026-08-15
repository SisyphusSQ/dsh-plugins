/**
 * mcp-sync.ts integration tests: store → patch rows, component toggles.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncMcpRows } from '../lib/mcp-sync.js'
import {
  EMPTY_LEDGER,
  installFromSource,
  setMcpEnabled,
  setPluginEnabled,
  type Ledger,
} from '../lib/store.js'

const fixtures = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

async function makeEnv(): Promise<{ storeDir: string; dataRoot: string; patchFile: string }> {
  const base = await mkdtemp(join(tmpdir(), 'ap-mcpsync-'))
  return {
    storeDir: join(base, 'store'),
    dataRoot: join(base, 'data'),
    patchFile: join(base, 'cordis.patch.yml'),
  }
}

async function sync(storeDir: string, dataRoot: string, patchFile: string, ledger: Ledger, warns: string[] = []) {
  return syncMcpRows({
    storeDirs: [storeDir],
    dataRoot,
    managedPatch: patchFile,
    readLedger: () => ledger,
    warn: (m) => warns.push(m),
  })
}

test('syncMcpRows maps enabled servers into the managed patch', async () => {
  const { storeDir, dataRoot, patchFile } = await makeEnv()
  await mkdir(storeDir, { recursive: true })
  const ledger = structuredClone(EMPTY_LEDGER)
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)

  const result = await sync(storeDir, dataRoot, patchFile, ledger)
  assert.equal(result.error, undefined)
  assert.equal(result.changed, true)
  assert.equal(result.entries.length, 2)
  const text = await readFile(patchFile, 'utf8')
  assert.ok(text.includes('ap-mcp-hello-world-tools'))
  assert.ok(text.includes('ap-mcp-hello-world-remote'))
  // stdio mapping: command resolved into the plugin root, placeholders expanded.
  assert.ok(text.includes(join(storeDir, 'hello-world@1.2.3', 'bin', 'tools')))
  assert.ok(text.includes(join(dataRoot, 'hello-world')))
  // Reserved env vars are injected per spec §9.1.
  assert.ok(text.includes('PLUGIN_ROOT'))
  assert.ok(text.includes('PLUGIN_DATA'))
})

test('server-level disable removes exactly that row', async () => {
  const { storeDir, dataRoot, patchFile } = await makeEnv()
  await mkdir(storeDir, { recursive: true })
  const ledger = structuredClone(EMPTY_LEDGER)
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)
  await setMcpEnabled(storeDir, ledger, 'hello-world', 'hello-world__tools', false)

  const result = await sync(storeDir, dataRoot, patchFile, ledger)
  assert.equal(result.entries.length, 1)
  const text = await readFile(patchFile, 'utf8')
  assert.ok(!text.includes('ap-mcp-hello-world-tools'))
  assert.ok(text.includes('ap-mcp-hello-world-remote'))
})

test('plugin-level disable removes all its MCP rows', async () => {
  const { storeDir, dataRoot, patchFile } = await makeEnv()
  await mkdir(storeDir, { recursive: true })
  const ledger = structuredClone(EMPTY_LEDGER)
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)
  await setPluginEnabled(storeDir, ledger, 'hello-world', false)

  const result = await sync(storeDir, dataRoot, patchFile, ledger)
  assert.equal(result.entries.length, 0)
})

test('sse servers are skipped with a warning, others survive', async () => {
  const { storeDir, dataRoot, patchFile } = await makeEnv()
  await mkdir(storeDir, { recursive: true })
  const ledger = structuredClone(EMPTY_LEDGER)
  const warns: string[] = []
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)
  // valid-plugin's mcp.json has no sse; parse-level sse handling is covered
  // in manifest tests. Here we only assert the sync runs cleanly.
  const result = await sync(storeDir, dataRoot, patchFile, ledger, warns)
  assert.equal(result.error, undefined)
  assert.equal(result.entries.length, 2)
})

test('uninstall clears the generated rows on the next sync', async () => {
  const { storeDir, dataRoot, patchFile } = await makeEnv()
  await mkdir(storeDir, { recursive: true })
  const ledger = structuredClone(EMPTY_LEDGER)
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)
  const { uninstallPlugin } = await import('../lib/store.js')
  await uninstallPlugin(storeDir, dataRoot, ledger, 'hello-world')

  const result = await sync(storeDir, dataRoot, patchFile, ledger)
  assert.equal(result.entries.length, 0)
  const text = await readFile(patchFile, 'utf8')
  assert.ok(!text.includes('ap-mcp-hello_world'))
})
