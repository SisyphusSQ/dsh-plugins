import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFile, writeFile, mkdtemp, rm, realpath } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { stringify, parse } from 'yaml'

const require = createRequire(import.meta.url)
const cordisRequire = createRequire(require.resolve('@deepseek-ai/cordis'))
const { Loader } = await import(pathToFileURL(cordisRequire.resolve('@deepseek-ai/cordis-plugin-loader')).href)

test('native Loader starts the built browser entry and renders a reviewed settings snapshot with fixture Host boundaries', { timeout: 10000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-settings-loader-'))
  const ctx = new Context()
  const loader = ctx.plugin(Loader, { baseUrl: pathToFileURL(root + '/').href })
  let outlet, copy, subscribed = false
  const config = { status: 'ready', writable: true, revision: 1, value: { home: '/fixture/.codex', enabled: true, instructions: true, skills: true, plugins: true, agents: true, connectMcp: false, executeHooks: false } }
  const catalog = { home: '/fixture/.codex', scannedAt: '2026-10-24T14:30:00Z', skills: [], plugins: [], agents: [], mcp: [], hooks: [], diagnostics: [] }
  // Browser outlet and Host-facing services are controlled boundaries. Cordis
  // Loader, published client entry, store, Page and catalog reader are real.
  const release = [
    ctx.provide('remote', { $mount: async () => {}, suqingsqCodexBridge: { catalog: async () => ({ ok: true, value: catalog }) } }),
    ctx.provide('configForms', { get: () => ({ getSnapshot: () => config, subscribe: () => { subscribed = true; return () => { subscribed = false } }, set: async () => false }) }),
    ctx.provide('locale', { bind: () => key => copy.zh[key], register: (_namespace, value) => { copy = value; return () => {} } }),
    ctx.provide('slots', { inject: (_name, register) => register(), register: (options, Page) => { outlet = { options, Page }; return () => {} } }),
  ]
  try {
    await loader.await()
    const configFile = join(root, 'cordis.yml')
    await writeFile(configFile, stringify([{ id: 'settings', name: new URL('../lib/client/index.js', import.meta.url).href }]))
    await ctx.loader.root.update(parse(await readFile(configFile, 'utf8')))
    await ctx.loader.await()
    assert.equal(ctx.loader.resolve('settings').fiber.state, 2)
    assert.ok(outlet)
    const store = outlet.options.store.create()
    const injected = outlet.options.inject(store.actions)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(store.getSnapshot().catalogStatus, 'ready')
    const markup = renderToStaticMarkup(createElement(outlet.Page, { ...injected, t: key => copy.zh[key], useStore: select => select(store.getSnapshot()) }))
      .replace(/<style>[\s\S]*?<\/style>/u, '<style>[scoped theme styles]</style>').replaceAll('><', '>\n<') + '\n'
    const expected = new URL('./snapshots/settings-page.html', import.meta.url)
    if (process.env.UPDATE_SETTINGS_SNAPSHOT === '1') await writeFile(expected, markup)
    assert.equal(markup, await readFile(expected, 'utf8'))
    const bridge = ctx.loader.resolve('settings').fiber
    ctx.loader.remove('settings')
    await bridge.await()
    await ctx.loader.await()
    assert.equal(subscribed, false, 'native fiber teardown releases the Host subscription')
  } finally {
    ctx.loader.root.stop()
    await ctx.loader.await()
    await loader.dispose()
    for (const dispose of release.reverse()) await dispose()
    const resolved = await realpath(root)
    assert.ok(basename(resolved).startsWith('codex-settings-loader-'))
    assert.equal(await realpath(join(resolved, '..')), await realpath(tmpdir()))
    await rm(resolved, { recursive: true, force: true })
  }
})
