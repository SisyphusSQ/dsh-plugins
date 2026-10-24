import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Page } from '../lib/client/Page.js'
import { en, zh } from '../lib/client/locales.js'

const ready = { status: 'ready', writable: true, revision: 1, value: { home: '/home', enabled: false, instructions: true, skills: true, plugins: true, agents: true, connectMcp: false, executeHooks: false } }
const catalog = {
  home: '/home', scannedAt: '2026-10-24T10:00:00.000Z', skills: [{ name: 'one', originalName: 'one', path: '/home/skills/one', modelInvocable: true }],
  plugins: [{ id: '<old-plugin>', version: '1', status: 'enabled', root: '/home/plugins/one', skills: 0, mcp: 0, hooks: 0 }],
  agents: [], mcp: [{ id: 'blocked', enabled: false, blockedReason: 'auth' }], hooks: [],
  diagnostics: [{ code: 'old-diagnostic', message: '<script>alert(1)</script>', severity: 'warning', source: '/home/config.toml' }],
}
function props(state = {}, copy = en, commit = () => {}) {
  return { t: key => copy[key], useStore: select => select({ config: ready, pending: false, error: undefined, catalog: undefined, catalogStatus: 'idle', ...state }), commit, refresh: () => {} }
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!node || typeof node !== 'object') return []
  return [node, ...nodes(node.props?.children)]
}
const markup = (state, copy) => renderToStaticMarkup(createElement(Page, props(state, copy)))

test('page groups seven named category switches with controls after their labels', () => {
  for (const copy of [en, zh]) {
    const tree = nodes(Page(props({}, copy)))
    const controls = tree.filter(node => node.type === 'input' && node.props.role === 'switch')
    assert.equal(controls.length, 7)
    assert.deepEqual(controls.map(node => node.props['aria-label']), [copy.enabled, copy.instructions, copy.skills, copy.plugins, copy.agents, copy.connectMcp, copy.executeHooks])
    assert.equal(tree.filter(node => node.type === 'h3').length, 4)
    for (const control of controls) {
      const label = tree.find(node => node.type === 'label' && nodes(node.props.children).includes(control))
      assert.ok(label)
      assert.equal(nodes(label).filter(node => typeof node.type === 'string').at(-1), control)
    }
  }
})

test('loading, read-only and pending disable every editable control', () => {
  for (const state of [{ config: { status: 'loading', writable: false } }, { config: { ...ready, writable: false } }, { pending: true }]) {
    const tree = nodes(Page(props(state)))
    const controls = tree.filter(node => node.type === 'input' || node.type === 'button' && node.props.type === 'submit')
    assert.equal(controls.length, 9)
    assert.ok(controls.every(node => node.props.disabled === true || tree.some(parent => parent.type === 'fieldset' && parent.props.disabled === true && nodes(parent).includes(node))))
  }
})

test('directory saves only a nonempty changed path and resets display to confirmed Host value', () => {
  const writes = []
  const tree = nodes(Page(props({}, en, (...args) => writes.push(args))))
  const form = tree.find(node => node.type === 'form')
  assert.ok(form, 'directory has an explicit save form')
  const field = tree.find(node => node.type === 'input' && node.props.type === 'text')
  assert.equal(field.props.required, true)
  const input = { value: '   ', setCustomValidity() {}, reportValidity() {} }
  const event = { preventDefault() {}, currentTarget: { elements: { namedItem: () => input } } }
  form.props.onSubmit(event)
  assert.deepEqual(writes, [])
  input.value = '/home'
  form.props.onSubmit(event)
  assert.deepEqual(writes, [])
  input.value = ' /different/home '
  form.props.onSubmit(event)
  assert.deepEqual(writes, [['home', '/different/home']])
  assert.equal(input.value, '/home')
  const disabledForm = nodes(Page(props({ pending: true }, en, (...args) => writes.push(args)))).find(node => node.type === 'form')
  input.value = '/blocked'
  disabledForm.props.onSubmit(event)
  assert.equal(writes.length, 1)
})

test('directory associates normal help separately from invalid-input errors', () => {
  const field = nodes(Page(props())).find(node => node.type === 'input' && node.props.type === 'text')
  assert.equal(field.props['aria-describedby'], 'codex-home-directory-hint')
  assert.equal(field.props['aria-errormessage'], 'codex-home-directory-error')
  const attributes = new Map()
  const input = { setCustomValidity() {}, setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) }
  field.props.onInvalid({ currentTarget: input })
  assert.equal(attributes.get('aria-invalid'), 'true')
  field.props.onInput({ currentTarget: input })
  assert.equal(attributes.has('aria-invalid'), false)
})

test('switch changes pass through commit without adopting unconfirmed values', () => {
  const writes = []
  const control = nodes(Page(props({}, en, (...args) => writes.push(args)))).find(node => node.type === 'input' && node.props['aria-label'] === en.connectMcp)
  assert.ok(control)
  const input = { checked: true }
  control.props.onChange({ currentTarget: input })
  assert.deepEqual(writes, [['connectMcp', true]])
  assert.equal(input.checked, false)
  assert.equal(control.props.checked, false)
})

test('idle, loading and failed diagnostic states hide stale counts and details', () => {
  for (const [catalogStatus, expected] of [['idle', en.pending], ['loading', en.catalogLoading], ['failed', en.catalogFailed]]) {
    const html = markup({ catalogStatus, catalog })
    assert.ok(expected, `copy for ${catalogStatus}`)
    assert.ok(html.includes(expected))
    assert.ok(!html.includes('<dl'), 'unknown data is not displayed as zero counts')
    assert.ok(!html.includes('old-plugin'))
    assert.ok(!html.includes('old-diagnostic'))
    assert.ok(!html.includes(catalog.scannedAt))
  }
  assert.match(markup({ catalogStatus: 'loading' }), /<button[^>]*disabled/)
})

test('ready diagnostic snapshot has scoped counts, scan time and collapsed safe details', () => {
  const html = markup({ catalogStatus: 'ready', catalog })
  assert.match(html, /<dl/)
  assert.deepEqual([...html.matchAll(/<dd>(\d+)<\/dd>/gu)].map(match => Number(match[1])), [1, 1, 0, 1, 0])
  assert.match(html, /<time[^>]*dateTime="2026-10-24T10:00:00.000Z"/)
  assert.equal((html.match(/<details>/gu) ?? []).length, 2)
  assert.ok(html.includes('&lt;old-plugin&gt;'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes(en.catalogScope))
})

test('save errors and readonly status remain visible beside settings', () => {
  assert.ok(markup({ error: 'refused' }).includes(en.refused))
  assert.ok(markup({ error: 'failed' }).includes(en.failed))
  assert.ok(markup({ config: { ...ready, writable: false } }).includes(en.unavailable))
  assert.ok(markup({ pending: true }).includes(en.saving))
})
