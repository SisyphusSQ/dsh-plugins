import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/client/index.js'

const catalog = { home: '/fixture', scannedAt: '2026-10-24T12:00:00Z', skills: [], plugins: [], agents: [], mcp: [], hooks: [], diagnostics: [] }
const tick = () => new Promise(resolve => setImmediate(resolve))

// Only the Host transport, settings source and slot outlet are controlled here.
// The shipped apply function, store engine, actions and reader run unchanged.
async function mount(read, initialStatus = 'ready') {
  let snapshot = { status: initialStatus, writable: initialStatus === 'ready', value: initialStatus === 'ready' ? { home: '/fixture' } : undefined, revision: 1 }
  const listeners = new Set()
  const releases = []
  let contribution
  let subscribed = true
  const ctx = {
    remote: { $mount: async () => {}, suqingsqCodexBridge: { catalog: read } },
    configForms: { get: () => ({ getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => { subscribed = false; listeners.delete(listener) } }, set: async () => true }) },
    locale: { bind: () => key => key, register: () => () => {} },
    effect: factory => { const release = factory(); if (release) releases.push(release) },
    slots: { inject: (_name, register) => register(), register: (options, component) => { contribution = { options, component }; return () => {} } },
  }
  await apply(ctx)
  const instance = contribution.options.store.create()
  const injected = contribution.options.inject(instance.actions)
  return {
    instance, injected,
    rebind: () => { const next = contribution.options.store.create(); contribution.options.inject(next.actions); return next },
    change: () => { snapshot = { ...snapshot, status: 'ready', writable: true, revision: 2, value: { home: '/new' } }; for (const notify of listeners) notify() },
    close: () => { for (const release of releases.reverse()) release() },
    get subscribed() { return subscribed },
  }
}

test('initial catalog read waits for Host settings instead of being invalidated by their first arrival', async () => {
  let calls = 0
  const app = await mount(async () => { calls++; return { ok: true, value: catalog } }, 'loading')
  assert.equal(calls, 0)
  app.change()
  await tick()
  assert.equal(calls, 1)
  assert.equal(app.instance.getSnapshot().catalogStatus, 'ready')
  app.change()
  await tick()
  assert.equal(calls, 1, 'later setting changes invalidate without automatic rereads')
  assert.equal(app.instance.getSnapshot().catalogStatus, 'idle')
  app.close()
})

test('browser entry publishes catalog loading/failure and keeps it across page remounts', async () => {
  const app = await mount(async () => { throw new Error('private failure') })
  await tick()
  assert.equal(app.instance.getSnapshot().catalogStatus, 'failed')
  const rebound = app.rebind()
  assert.equal(rebound.getSnapshot().catalogStatus, 'failed')
  assert.equal(rebound.getSnapshot().catalog, undefined)
  app.close()
  assert.equal(app.subscribed, false)
})

test('browser entry invalidates on Host changes and cannot publish after disposal', async () => {
  let resolve
  let calls = 0
  const app = await mount(() => { calls++; return new Promise(yes => { resolve = yes }) })
  assert.equal(app.instance.getSnapshot().catalogStatus, 'loading')
  app.change()
  assert.equal(app.instance.getSnapshot().catalogStatus, 'idle')
  assert.equal(app.instance.getSnapshot().config.value.home, '/new')
  resolve({ ok: true, value: catalog })
  await tick()
  assert.equal(app.instance.getSnapshot().catalog, undefined)
  app.injected.refresh()
  assert.equal(calls, 2)
  const before = app.instance.getSnapshot()
  app.close()
  resolve({ ok: true, value: catalog })
  await tick()
  assert.equal(app.instance.getSnapshot(), before)
})
