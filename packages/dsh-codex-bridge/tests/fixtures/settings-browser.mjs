import React, { createElement, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import * as jsx from 'react/jsx-runtime'
import { defineStore } from '@deepseek-ai/dsh-client-store'

// Fixture Host boundaries only. The shipped browser wrapper supplies Page,
// commit, catalog reader and registration; no real Home or credentials are read.
const fixture = window.settingsFixture = {
  writes: [], confirms: [], authorize: false, writeOutcome: 'accepted', readOutcome: 'ready', holdWrites: false,
}
window.confirm = message => { fixture.confirms.push(message); return fixture.authorize }
let config = {
  status: 'ready', writable: true, revision: 1,
  value: { home: '/Users/fixture/.codex', enabled: true, instructions: true, skills: true, plugins: true, agents: true, connectMcp: false, executeHooks: false },
}
const listeners = new Set()
const notify = () => { for (const listener of listeners) listener() }
const catalog = {
  home: '/Users/fixture/.codex', scannedAt: '2026-10-24T14:30:00Z',
  skills: [{ name: 'fixture-skill', originalName: 'Fixture', path: '/fixture', modelInvocable: true }],
  plugins: [{ id: `fixture-${'long-name-'.repeat(12)}`, version: '1.0.0', status: 'unknown', root: '/fixture', skills: 1, mcp: 1, hooks: 0 }],
  agents: [], mcp: [{ id: 'fixture-mcp', enabled: false, blockedReason: 'Configure independently in DSH' }], hooks: [],
  diagnostics: [{ severity: 'warning', code: 'FIXTURE_WARNING', source: `/fixture/${'long-directory/'.repeat(12)}`, message: '<img src=x onerror=alert(1)> 这是只读诊断示例，不代表真实 Home 状态。' }],
}
fixture.setConfig = update => { config = { ...config, ...update }; notify() }
const form = {
  getSnapshot: () => config,
  subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
  async set(field, value) {
    fixture.writes.push([field, value])
    if (fixture.holdWrites) await new Promise(resolve => { fixture.releaseWrite = resolve })
    if (fixture.writeOutcome === 'failed') throw new Error('fixture transport error')
    if (fixture.writeOutcome === 'refused') return false
    config = { ...config, revision: config.revision + 1, value: { ...config.value, [field]: value } }
    notify()
    return true
  },
}
const releases = []
let translations
const ctx = {
  configForms: { get: () => form },
  remote: { $mount: async () => {}, suqingsqCodexBridge: { catalog: async () => {
    if (fixture.readOutcome === 'loading') await new Promise(resolve => { fixture.releaseRead = resolve })
    if (fixture.readOutcome === 'failed') throw new Error('fixture read error')
    return { ok: true, value: catalog }
  } } },
  locale: { bind: () => key => translations[fixture.language ?? 'zh'][key], register: (_name, copy) => { translations = copy; return () => {} } },
  effect: factory => { const dispose = factory(); if (dispose) releases.push(dispose) },
  slots: {
    inject: (_name, register) => register(),
    register(options, Page) {
      const store = options.store.create()
      const injected = options.inject(store.actions)
      function Outlet() {
        const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
        return createElement(Page, { ...injected, t: key => translations[fixture.language ?? 'zh'][key], useStore: select => select(snapshot) })
      }
      createRoot(document.getElementById('root')).render(createElement(Outlet))
      fixture.store = store
      return () => {}
    },
  },
}
window.__ModuleLoader__ = { load: contribution => {
  const modules = { '@deepseek-ai/dsh-client-store': { defineStore }, 'react/jsx-runtime': jsx }
  const bridge = contribution.factory(id => {
    if (!(id in modules)) throw new Error(`Unexpected browser dependency: ${id}`)
    return modules[id]
  })
  bridge.apply(ctx).then(() => { fixture.mounted = true })
} }
