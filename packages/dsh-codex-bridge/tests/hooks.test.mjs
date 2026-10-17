import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileHook, HookBridge, registerHooks } from '../lib/hooks.js'

const row = (event = 'PreToolUse', handler = {}) => ({ event, source: 'hooks.json', root: '/safe/home', handler: { type: 'command', command: 'test-only-command', ...handler } })
const output = (extra = {}) => ({ output: { exitCode: 0, stdout: '', stderr: '', ...extra }, durationMs: 1 })
function setup(rows, runner) {
  let options = { enabled: true, executeHooks: true, plugins: true }
  const listeners = new Map(), warnings = []
  const ctx = { shell: {}, logger: { warn: m => warnings.push(m) }, on: (name, handler) => listeners.set(name, handler), sessionProjections: { stateOf: () => ({ lastTurn: 1 }) } }
  const runtime = { options: () => options, catalog: async () => ({ hooks: rows }) }
  const bridge = new HookBridge(ctx, runtime, 600000, runner)
  return { bridge, ctx, listeners, warnings, set: next => { options = { ...options, ...next } } }
}
test('hook compiler rejects non-equivalent execution without revealing commands', () => {
  assert.equal(compileHook(row('Stop', { timeout: 1 })).command.timeoutSec, 1)
  for (const r of [row('Unknown'), row('PreToolUse', { async: true }), row('PreToolUse', { env: {} }), row('PreToolUse', { type: 'prompt' }), row('PreToolUse', { timeout: -1 }), { ...row(), matcher: '[' }]) assert.throws(() => compileHook(r), error => !error.message.includes('test-only-command'))
})
test('disabled grant and plugin category never start hook commands', async () => {
  let calls = 0
  const s = setup([{ ...row(), pluginId: 'example@market' }], async () => { calls++; return output() })
  s.set({ executeHooks: false })
  await s.bridge.run('PreToolUse', 'bash', {}, {})
  s.set({ executeHooks: true, plugins: false })
  await s.bridge.run('PreToolUse', 'bash', {}, {})
  assert.equal(calls, 0)
  await s.bridge.close()
})
test('revocation aborts a pending hook and discards returned context', async () => {
  let observed, started
  const ready = new Promise(resolve => { started = resolve })
  const s = setup([row('UserPromptSubmit')], async (_shell, _command, options) => {
    observed = options
    started()
    await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }))
    return output({ additionalContext: 'revoked context', decision: 'deny' })
  })
  const run = s.bridge.run('UserPromptSubmit', '', { prompt: 'fixture' }, {})
  await ready
  s.set({ executeHooks: false })
  s.bridge.reconcile()
  const result = await run
  assert.ok(observed.signal.aborted)
  assert.deepEqual(result.additionalContext, [])
  assert.notEqual(result.decision, 'deny')
  await s.bridge.close()
})
test('unload drains hook commands and no longer accepts events', async () => {
  let started, calls = 0
  const ready = new Promise(resolve => { started = resolve })
  const s = setup([row()], async (_shell, _hook, options) => {
    calls++; started()
    await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }))
    return output()
  })
  const pending = s.bridge.run('PreToolUse', 'bash', {}, {})
  await ready
  await s.bridge.close()
  await pending
  await s.bridge.run('PreToolUse', 'bash', {}, {})
  assert.equal(calls, 1)
})
test('unsupported approval and rewrites fail closed, as does continue false', async () => {
  for (const extra of [{ decision: 'ask' }, { updatedInput: { command: 'replacement' } }, { continue: false, stopReason: 'stop fixture' }]) {
    const s = setup([row()], async () => output(extra))
    const result = await s.bridge.run('PreToolUse', 'bash', {}, {})
    assert.equal(result.decision, 'deny')
    await s.bridge.close()
  }
})
test('actual rc.2 runner preserves Codex framing and parses blocking stdout', async () => {
  let request
  const s = setup([row('PreToolUse', { timeout: 2 })])
  s.ctx.shell = {
    resolve: input => { request = input; return input },
    execute: async () => ({ result: async () => ({ exitCode: 0, stdout: { text: '{"decision":"block","reason":"protocol fixture"}' }, stderr: { text: '' } }) })
  }
  const result = await s.bridge.run('PreToolUse', 'bash', { hook_event_name: 'PreToolUse', fixture: 1 }, {})
  assert.equal(request.timeoutMs, 2000)
  assert.equal(request.workdir, '/safe/home')
  assert.equal(request.stdin, '{"hook_event_name":"PreToolUse","fixture":1}')
  assert.equal(result.decision, 'deny')
  assert.equal(result.reason, 'protocol fixture')
  await s.bridge.close()
})
test('pre-tool denial cannot become allow and hook payload preserves structured arguments', async () => {
  let payload, nextCalls = 0
  const s = setup([row()], async (_shell, _hook, options) => { payload = options.payload; return output({ decision: 'deny', reason: 'fixture denial' }) })
  registerHooks(s.ctx, s.bridge)
  const args = { path: '/fixture', nested: { count: 2 } }
  const result = await s.listeners.get('tools/pre-execute')({ name: 'read', arguments: args, callId: 'fixture-id', signal: new AbortController().signal }, async () => { nextCalls++; return { kind: 'allow' } })
  assert.equal(result.kind, 'deny')
  assert.equal(nextCalls, 0)
  assert.deepEqual(payload.tool_input, args)
  assert.equal(payload.transcript_path, null)
  await s.bridge.close()
})
