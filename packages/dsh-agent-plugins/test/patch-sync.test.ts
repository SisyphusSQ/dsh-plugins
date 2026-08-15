/**
 * patch-sync.ts tests: managed-section preservation, atomic writes, idempotency.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MANAGED_SECTION_END,
  MANAGED_SECTION_START,
  serializeManagedSection,
  splitManagedSection,
  syncPatchFile,
  managedEntryIds,
  mcpPatchEntry,
} from '../lib/patch-sync.js'

const entry = mcpPatchEntry('hello-world', 'tools', {
  serverName: 'hello_world__tools',
  transport: 'stdio',
  command: '/store/hello-world@1.0.0/bin/tools',
  args: ['--data=${PLUGIN_DATA}'],
  cwd: '/store/hello-world@1.0.0',
})

test('splitManagedSection finds and isolates the managed block', () => {
  const text = `- id: user-row\n  name: something\n\n${MANAGED_SECTION_START}\n- insert:\n    - id: ap-mcp-x\n${MANAGED_SECTION_END}\n`
  const { head, managed, tail } = splitManagedSection(text)
  assert.ok(head.includes('user-row'))
  assert.ok(!head.includes(MANAGED_SECTION_START))
  assert.ok(managed.includes('ap-mcp-x'))
  assert.equal(tail, '')
})

test('splitManagedSection tolerates a damaged end marker', () => {
  const text = `- id: user-row\n\n${MANAGED_SECTION_START}\n- insert:\n    - id: ap-mcp-x\n`
  const { head, managed } = splitManagedSection(text)
  assert.ok(head.includes('user-row'))
  assert.equal(managed, '')
})

test('serializeManagedSection emits valid loader patch syntax', () => {
  const text = serializeManagedSection([entry])
  assert.ok(text.startsWith(MANAGED_SECTION_START))
  assert.ok(text.includes('- insert:'))
  assert.ok(text.includes(`- id: ap-mcp-hello-world-tools`))
  assert.ok(text.includes(`name: '@deepseek-ai/dsh-mcp-client'`))
  assert.ok(text.endsWith(`${MANAGED_SECTION_END}\n`))
})

test('syncPatchFile preserves user entries and is idempotent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ap-patch-'))
  const file = join(dir, 'cordis.patch.yml')
  await writeFile(file, '- id: user-row\n  name: "@deepseek-ai/dsh-goal"\n')

  const first = await syncPatchFile(file, [entry])
  assert.equal(first.changed, true)
  const after = await readFile(file, 'utf8')
  assert.ok(after.includes('user-row'))
  assert.ok(after.includes(MANAGED_SECTION_START))
  assert.ok(after.includes('ap-mcp-hello-world-tools'))

  const second = await syncPatchFile(file, [entry])
  assert.equal(second.changed, false, 'identical content must not rewrite the file')

  // Emptying the managed section keeps user entries.
  const third = await syncPatchFile(file, [])
  assert.equal(third.changed, true)
  const cleared = await readFile(file, 'utf8')
  assert.ok(cleared.includes('user-row'))
  assert.ok(!cleared.includes('ap-mcp-hello-world-tools'))
  assert.ok(cleared.includes(MANAGED_SECTION_START))
})

test('syncPatchFile creates a missing file with just the managed section', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ap-patch-'))
  const file = join(dir, 'cordis.patch.yml')
  const result = await syncPatchFile(file, [entry])
  assert.equal(result.changed, true)
  assert.equal(result.error, undefined)
  const text = await readFile(file, 'utf8')
  assert.ok(text.startsWith(MANAGED_SECTION_START))
})

test('managedEntryIds extracts generated ids only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ap-patch-'))
  const file = join(dir, 'cordis.patch.yml')
  await syncPatchFile(file, [entry])
  const ids = await managedEntryIds(file)
  assert.deepEqual(ids, ['ap-mcp-hello-world-tools'])
})

test('user rows survive across repeated syncs with different sets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ap-patch-'))
  const file = join(dir, 'cordis.patch.yml')
  await writeFile(file, '- id: keep-me\n  name: x\n')
  const other = mcpPatchEntry('hello-world', 'remote', {
    serverName: 'hello_world__remote',
    transport: 'streamable-http',
    url: 'https://m.example.com/sse',
  })
  await syncPatchFile(file, [entry])
  await syncPatchFile(file, [other])
  const text = await readFile(file, 'utf8')
  assert.ok(text.includes('keep-me'))
  assert.ok(text.includes('ap-mcp-hello-world-remote'))
  assert.ok(!text.includes('ap-mcp-hello-world-tools'))
})

test('serialized managed section parses as valid YAML loader patch list', async () => {
  const { parse } = await import('yaml')
  const text = serializeManagedSection([entry])
  // The whole section (minus markers) must parse: an `- insert:` entry with rows.
  const parsed = parse(text.replace(new RegExp(`^${MANAGED_SECTION_START}$`, 'm'), '').replace(new RegExp(`^${MANAGED_SECTION_END}$`, 'm'), ''))
  assert.ok(Array.isArray(parsed), 'must parse to an array')
  const insert = (parsed as Array<{ insert?: unknown[] }>).find((e) => 'insert' in e)
  assert.ok(insert !== undefined)
  assert.equal((insert.insert as Array<{ id: string }>)[0]?.id, 'ap-mcp-hello-world-tools')
  const row = (insert.insert as Array<{ name: string; config: { serverName: string } }>)[0]
  assert.equal(row?.name, '@deepseek-ai/dsh-mcp-client')
  assert.equal(row?.config.serverName, 'hello_world__tools')
})
