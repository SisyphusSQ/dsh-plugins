import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCatalogReader } from '../lib/client/catalog-reader.js'

const catalog = { home: '/fixture', scannedAt: '2026-10-24T12:00:00Z', skills: [], plugins: [], agents: [], mcp: [], hooks: [], diagnostics: [] }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture(read) {
  let snapshot = { revision: 1 }
  const updates = []
  const reader = createCatalogReader(read, () => snapshot, (status, value) => updates.push([status, value]))
  return { reader, updates, change: () => { snapshot = { revision: 2 }; reader.invalidate() } }
}

test('catalog refresh publishes loading then ready and coalesces duplicate requests', async () => {
  const result = deferred()
  let calls = 0
  const { reader, updates } = fixture(() => { calls++; return result.promise })
  const first = reader.refresh()
  const second = reader.refresh()
  assert.equal(calls, 1)
  assert.deepEqual(updates, [['loading', undefined]])
  result.resolve({ ok: true, value: catalog })
  await Promise.all([first, second])
  assert.deepEqual(updates.at(-1), ['ready', catalog])
  assert.equal(reader.getSnapshot().status, 'ready')
})

test('catalog refusal and transport failure remain explicit without publishing raw error details', async () => {
  for (const failure of [() => Promise.resolve({ ok: false, error: 'private remote payload' }), () => Promise.reject(new Error('private remote payload'))]) {
    const { reader, updates } = fixture(failure)
    await reader.refresh()
    assert.deepEqual(updates, [['loading', undefined], ['failed', undefined]])
    assert.deepEqual(reader.getSnapshot(), { status: 'failed', value: undefined })
    assert.ok(!JSON.stringify(updates).includes('private'))
  }
})

test('settings invalidation discards a late success and permits a fresh explicit read', async () => {
  const old = deferred()
  let calls = 0
  const { reader, updates, change } = fixture(() => ++calls === 1 ? old.promise : Promise.resolve({ ok: true, value: catalog }))
  const pending = reader.refresh()
  change()
  assert.deepEqual(reader.getSnapshot(), { status: 'idle', value: undefined })
  old.resolve({ ok: true, value: { ...catalog, home: '/old' } })
  await pending
  assert.deepEqual(updates, [['loading', undefined], ['idle', undefined]])
  await reader.refresh()
  assert.equal(calls, 2)
  assert.deepEqual(updates.at(-1), ['ready', catalog])
})

test('snapshot identity changes without a notification still cannot adopt stale diagnostics', async () => {
  const result = deferred()
  let snapshot = {}
  const updates = []
  const reader = createCatalogReader(() => result.promise, () => snapshot, (status, value) => updates.push([status, value]))
  const pending = reader.refresh()
  snapshot = {}
  result.resolve({ ok: true, value: catalog })
  await pending
  assert.deepEqual(updates.at(-1), ['idle', undefined])
})

test('late failures cannot overwrite invalidation and unload stops all publication and reads', async () => {
  const result = deferred()
  let calls = 0
  const { reader, updates, change } = fixture(() => { calls++; return result.promise })
  const pending = reader.refresh()
  change()
  result.reject(new Error('old request'))
  await pending
  assert.deepEqual(updates.at(-1), ['idle', undefined])
  reader.close()
  await reader.refresh()
  reader.invalidate()
  assert.equal(calls, 1)
  assert.equal(updates.length, 2)

  const closing = deferred()
  const second = fixture(() => closing.promise)
  const last = second.reader.refresh()
  second.reader.close()
  closing.resolve({ ok: true, value: catalog })
  await last
  assert.deepEqual(second.updates, [['loading', undefined]])
})

test('refresh clears earlier results while loading and fails without showing old data as current', async () => {
  let calls = 0
  const { reader, updates } = fixture(() => Promise.resolve(++calls === 1 ? { ok: true, value: catalog } : { ok: false }))
  await reader.refresh()
  const refresh = reader.refresh()
  assert.deepEqual(reader.getSnapshot(), { status: 'loading', value: undefined })
  await refresh
  assert.deepEqual(updates.at(-1), ['failed', undefined])
})
