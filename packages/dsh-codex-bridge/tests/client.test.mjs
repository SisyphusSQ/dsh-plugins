import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { Page } from '../lib/client/Page.js'
import { en } from '../lib/client/locales.js'
import { createCommit } from '../lib/client/commit.js'

const ready = { status: 'ready', writable: true, revision: 1, value: { home: '/home', enabled: false, instructions: true, skills: true, plugins: true, agents: true, connectMcp: false, executeHooks: false } }
test('settings page renders only aggregate controls and safe copy', () => {
  const markup = renderToStaticMarkup(createElement(Page, {
    t: key => en[key], useStore: select => select({ config: ready, pending: false }), commit: () => {}, refresh: () => {},
  }))
  assert.equal((markup.match(/type="checkbox"/gu) ?? []).length, 7)
  assert.equal((markup.match(/type="text"/gu) ?? []).length, 1)
  assert.match(markup, /entire categories/)
  assert.match(markup, /not sandboxed/)
  assert.ok(!markup.includes('API_KEY'))
})
test('authorization requires explicit confirmation and revocation does not', async () => {
  const writes = []
  const states = []
  const host = { getSnapshot: () => ready, set: async (...args) => { writes.push(args); return true } }
  const denied = createCommit(host, () => false, (...args) => states.push(args))
  await denied.commit('connectMcp', true)
  assert.equal(writes.length, 0)
  const allowed = createCommit(host, () => true, (...args) => states.push(args))
  await allowed.commit('connectMcp', true)
  assert.deepEqual(writes[0], ['connectMcp', true])
  assert.deepEqual(states, [[true], [false, undefined]])
  ready.value.connectMcp = true
  await denied.commit('connectMcp', false)
  assert.deepEqual(writes[1], ['connectMcp', false])
  ready.value.connectMcp = false
})
test('write refusal, read-only settings and unload never adopt optimistic values', async () => {
  const states = []
  const snapshot = { ...ready }
  let settle
  let writes = 0
  const host = { getSnapshot: () => snapshot, set: async () => { writes++; return new Promise(resolve => { settle = resolve }) } }
  const editor = createCommit(host, () => true, (...args) => states.push(args))
  const pending = editor.commit('skills', false)
  await editor.commit('plugins', false)
  assert.equal(writes, 1)
  settle(false)
  await pending
  assert.deepEqual(states.at(-1), [false, 'refused'])
  assert.equal(snapshot.value.skills, true)
  snapshot.writable = false
  await editor.commit('skills', false)
  assert.equal(writes, 1)
  snapshot.writable = true
  const last = editor.commit('skills', false)
  editor.close()
  const before = states.length
  settle(true)
  await last
  assert.equal(states.length, before)
})
