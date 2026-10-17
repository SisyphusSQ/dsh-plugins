import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileMcp, McpBridge, mcpServerName } from '../lib/mcp.js'

const row = (config = {}) => ({ id: 'example@market:server', name: 'server', source: 'mcp.json', root: '/plugin/root', pluginId: 'example@market', enabled: true, config: { command: 'node', ...config } })

test('MCP mapper uses safe names, root interpolation and explicit timeout', () => {
  const config = compileMcp(row({ args: ['${CODEX_PLUGIN_ROOT}/server.js'], tool_timeout_sec: 5 }))
  assert.equal(config.transport, 'stdio')
  assert.deepEqual(config.args, ['/plugin/root/server.js'])
  assert.equal(config.cwd, '/plugin/root')
  assert.equal(config.toolCallTimeoutMs, 5000)
  assert.equal(config.reconnect.enabled, false)
  assert.match(config.serverName, /^[A-Za-z0-9_-]{1,32}$/)
  assert.notEqual(mcpServerName('one:server'), mcpServerName('two:server'))
})
test('native mapper accepts matching transport types and rejects conflicting fields', () => {
  assert.equal(compileMcp(row({ type: 'stdio' })).transport, 'stdio')
  assert.equal(compileMcp({ ...row(), config: { type: 'http', url: 'https://example.org/mcp' } }).transport, 'streamable-http')
  for (const config of [
    { command: 'node', type: 'http' },
    { url: 'https://example.org/mcp', type: 'stdio' },
    { url: 'https://example.org/mcp', args: ['ignored-policy'] },
    { url: 'https://example.org/mcp', cwd: '/ignored' },
    { command: 'node', enabled: 'false' },
  ]) assert.throws(() => compileMcp({ ...row(), config }))
})
test('MCP mapper rejects secrets and untranslated policy before connecting', () => {
  for (const config of [
    { env: { API_KEY: 'credential' } },
    { bearer_token_env_var: 'KEY' },
    { enabled_tools: ['read'] },
    { startup_timeout_sec: 10 },
    { args: ['${TOKEN}'] },
    { tool_timeout_sec: -1 },
    { args: [123] },
  ]) assert.throws(() => compileMcp(row(config)))
  assert.throws(() => compileMcp(row({ command: undefined, url: 'https://example.org/?token=secret' })))
})
test('native-only bridge blocks authentication without opening transports', async () => {
  for (const config of [
    { command: 'node', env: { MODE: 'opaque-value' } },
    { command: 'node', env_vars: ['MODE'] },
    { url: 'https://example.org/mcp', http_headers: { 'X-Custom': 'opaque-value' } },
    { url: 'https://example.org/mcp', env_http_headers: { 'X-Custom': 'MODE' } },
  ]) {
    const item = { ...row(), config }
    assert.throws(() => compileMcp(item), /independent DSH/)
    const ctx = { tools: { guard: () => {} }, plugin: () => assert.fail('auth must be configured in DSH, not imported') }
    const runtime = { options: () => ({ enabled: true, connectMcp: true, plugins: true }), catalog: async () => ({ mcp: [item] }) }
    const bridge = new McpBridge(ctx, runtime)
    await bridge.reconcile()
    assert.equal(bridge.snapshot()[0].state, 'blocked')
    assert.match(bridge.snapshot()[0].reason, /independent DSH/)
    assert.ok(!JSON.stringify(bridge.snapshot()).includes('opaque-value'))
    await bridge.close()
  }
})
test('OAuth metadata requires independent DSH configuration without an anonymous transport', async () => {
  const oauthRow = row({ command: undefined, type: 'http', url: 'https://mcp.linear.app/mcp', oauth_resource: 'https://mcp.linear.app' })
  delete oauthRow.config.command // TOML has no undefined-valued transport field.
  assert.throws(() => compileMcp(oauthRow), /independent DSH/)
  const ctx = { tools: { guard: () => {} }, plugin: () => { assert.fail('OAuth metadata must not initiate an unauthenticated transport') } }
  const runtime = { options: () => ({ enabled: true, connectMcp: true, plugins: true }), catalog: async () => ({ mcp: [oauthRow] }) }
  const bridge = new McpBridge(ctx, runtime)
  await bridge.reconcile()
  assert.equal(bridge.snapshot()[0].state, 'blocked')
  assert.match(bridge.snapshot()[0].reason, /independent DSH/)
  assert.ok(!JSON.stringify(bridge.snapshot()).includes('https://'))
  await bridge.close()
  // An OAuth-looking secret still takes precedence over resource metadata.
  assert.throws(() => compileMcp(row({ ...oauthRow.config, oauth_token: 'PRIVATE_VALUE_MARKER' })), /Credential/)
})
test('aggregate revocation denies calls immediately and disposes a pending handshake', async () => {
  let guard
  let starts = 0
  let disposals = 0
  let ready
  const options = { enabled: true, connectMcp: false, plugins: true }
  const ctx = {
    tools: { guard: value => { guard = value } },
    plugin: () => {
      starts++
      const promise = new Promise(resolve => { ready = resolve })
      return { await: () => promise, dispose: async () => { disposals++; ready() } }
    },
  }
  const runtime = { options: () => options, catalog: async () => ({ mcp: [row()] }) }
  const bridge = new McpBridge(ctx, runtime)
  await bridge.reconcile()
  assert.equal(starts, 0)
  options.connectMcp = true
  await bridge.reconcile()
  assert.equal(starts, 1)
  assert.equal(bridge.snapshot()[0].state, 'connecting')
  const call = { name: `mcp__${mcpServerName(row().id)}__read` }
  assert.equal(guard(call), undefined)
  options.home = '/changed-home'
  assert.match(guard(call), /revoked/)
  delete options.home
  assert.equal(guard(call), undefined)
  options.plugins = false
  assert.match(guard(call), /revoked/)
  await bridge.reconcile()
  assert.equal(disposals, 1)
  assert.equal(bridge.snapshot().length, 0)
  await bridge.close()
  assert.equal(disposals, 1)
})
test('a Home change during disposal cannot mount a stale replacement', async () => {
  let starts = 0, disposeStarted, finishDispose
  const entered = new Promise(resolve => { disposeStarted = resolve })
  const released = new Promise(resolve => { finishDispose = resolve })
  const options = { home: '/first', enabled: true, connectMcp: true, plugins: true }
  let config = { args: ['first'] }
  const ctx = { tools: { guard: () => {} }, plugin: () => {
    starts++
    return { await: async () => {}, dispose: async () => { disposeStarted(); await released } }
  } }
  const runtime = { options: () => ({ ...options }), catalog: async () => ({ mcp: [row(config)] }) }
  const bridge = new McpBridge(ctx, runtime)
  await bridge.reconcile()
  config = { args: ['replacement'] }
  const pending = bridge.reconcile()
  await entered
  options.home = '/second'
  finishDispose()
  await pending
  assert.equal(starts, 1)
  await bridge.close()
})
test('failed MCP startup is not retried every poll and errors are sanitized', async () => {
  let starts = 0
  const ctx = { tools: { guard: () => {} }, plugin: () => { starts++; return { await: async () => { throw new Error('PRIVATE_COMMAND_MARKER') }, dispose: async () => {} } } }
  const runtime = { options: () => ({ enabled: true, connectMcp: true, plugins: true }), catalog: async () => ({ mcp: [row()] }) }
  const bridge = new McpBridge(ctx, runtime)
  await bridge.reconcile()
  await bridge.reconcile()
  assert.equal(starts, 1)
  assert.equal(bridge.snapshot()[0].state, 'failed')
  assert.ok(!JSON.stringify(bridge.snapshot()).includes('PRIVATE_COMMAND_MARKER'))
  await bridge.close()
})
