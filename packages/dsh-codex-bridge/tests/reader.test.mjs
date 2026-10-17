import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HomeReader } from '../lib/reader.js'

async function fixture(t, maxEntries) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-codex-reader-budget-'))
  assert.ok(home.startsWith(join(tmpdir(), 'dsh-codex-reader-budget-')))
  t.after(() => rm(home, { recursive: true, force: true }))
  return { home, reader: new HomeReader({ home, maxEntries, maxFileBytes: 1024 }, []) }
}
test('directory and text access share a total scan budget', async t => {
  const { home, reader } = await fixture(t, 4)
  await mkdir(join(home, 'first'))
  await mkdir(join(home, 'second'))
  await writeFile(join(home, 'file.md'), 'fixture')
  await reader.entries('first')
  await reader.entries('second')
  assert.equal(await reader.text('file.md'), 'fixture')
  await reader.entries('first')
  await assert.rejects(() => reader.entries('second'), { code: 'ENTRY_LIMIT' })
  await assert.rejects(() => reader.text('file.md'), { code: 'ENTRY_LIMIT' })
})
test('streamed directory entries exhaust the budget across multiple directories', async t => {
  const { home, reader } = await fixture(t, 4)
  await mkdir(join(home, 'first'))
  await mkdir(join(home, 'second'))
  await writeFile(join(home, 'first/one.md'), 'one')
  await writeFile(join(home, 'first/two.md'), 'two')
  await writeFile(join(home, 'second/three.md'), 'three')
  assert.equal((await reader.entries('first')).length, 2)
  await assert.rejects(() => reader.entries('second'), { code: 'ENTRY_LIMIT' })
})
