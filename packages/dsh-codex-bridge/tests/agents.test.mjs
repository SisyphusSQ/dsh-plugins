import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileRole, registerAgentTools, RoleBridge } from '../lib/agents.js'

const role = config => ({ name: 'reviewer', description: 'Review code', path: '/home/agents/reviewer.toml', developerInstructions: 'Review carefully.', config })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function harness(startActivation, roleConfig = {}) {
  let options = { enabled: true, agents: true, home: '/fixture' }
  const parent = { id: 'parent', options: { provider: 'fixture-provider', model: 'fixture-model' }, session: { header: {}, requestHeader: () => undefined } }
  const ctx = { agents: { get: () => parent }, subagents: { startActivation, getProvider: () => ({ name: 'spawn' }) }, llm: { resolveModelInfo: async () => ({}) } }
  const runtime = { options: () => options, catalog: async () => ({ agents: [role(roleConfig)] }) }
  return { bridge: new RoleBridge(ctx, runtime), parent, ctx, set: edit => { options = { ...options, ...edit } } }
}
test('role result success and failure always dispose the owned real-delegation handle', async () => {
  for (const fail of [false, true]) {
    let disposed = 0, spec
    const h = harness(async activationSpec => {
      spec = activationSpec
      return { result: fail ? Promise.reject(new Error('fixture failure')) : Promise.resolve({ answer: 'fixture' }), dispose: async () => { disposed++ } }
    })
    const pending = h.bridge.run(h.parent, 'reviewer', 'Task', new AbortController().signal)
    if (fail) await assert.rejects(pending, /fixture failure/)
    else assert.deepEqual(JSON.parse(await pending), { answer: 'fixture' })
    assert.equal(spec.provider, 'spawn')
    assert.equal(spec.delivery, 'caller')
    assert.equal(spec.request.parent, h.parent)
    assert.match(spec.request.prompt[0].text, /^Review carefully\.\n\n---\n\nTask$/u)
    assert.equal(disposed, 1)
    await h.bridge.close()
  }
})
test('category revocation cancels an in-flight role and cannot publish its result', async () => {
  const started = deferred(), settled = deferred()
  let disposed = 0, signal
  const h = harness(async spec => {
    signal = spec.signal
    started.resolve()
    return { result: settled.promise, dispose: async () => { disposed++; settled.resolve({ answer: 'revoked' }) } }
  })
  const pending = h.bridge.run(h.parent, 'reviewer', 'Task', new AbortController().signal)
  // Attach the rejection handler before revocation.
  const rejected = assert.rejects(pending)
  await started.promise
  h.set({ agents: false }); h.bridge.reconcile()
  await rejected
  assert.ok(signal.aborted)
  assert.equal(disposed, 1)
  await h.bridge.close()
})
test('unload owns a pending child start and disposes the late handle', async () => {
  const started = deferred(), release = deferred()
  let disposed = 0, signal
  const h = harness(async spec => {
    signal = spec.signal; started.resolve(); await release.promise
    return { result: Promise.resolve({ answer: 'late' }), dispose: async () => { disposed++ } }
  })
  const pending = h.bridge.run(h.parent, 'reviewer', 'Task', new AbortController().signal)
  const rejected = assert.rejects(pending)
  await started.promise
  const close = h.bridge.close()
  assert.ok(signal.aborted)
  release.resolve()
  await close; await rejected
  assert.equal(disposed, 1)
})
test('model-route resolution cannot start a child after Home authorization changes', async () => {
  const entered = deferred(), release = deferred()
  let starts = 0
  const h = harness(async () => { starts++; throw new Error('unexpected start') }, { model: 'other-model' })
  h.ctx.llm.resolveModelInfo = async () => { entered.resolve(); await release.promise }
  const pending = h.bridge.run(h.parent, 'reviewer', 'Task', new AbortController().signal)
  const rejected = assert.rejects(pending, /authorization changed/)
  await entered.promise
  h.set({ home: '/changed' }); release.resolve()
  await rejected
  assert.equal(starts, 0)
  await h.bridge.close()
})

test('missing spawn provider rejects before model lookup or child start and can recover', async () => {
  let starts = 0, modelLookups = 0, disposed = 0
  const h = harness(async () => { starts++; return { result: Promise.resolve({ answer: 'recovered' }), dispose: async () => { disposed++ } } }, { model: 'other-model' })
  h.ctx.llm.resolveModelInfo = async () => { modelLookups++; return {} }
  h.ctx.subagents.getProvider = () => undefined
  try {
    await assert.rejects(h.bridge.run(h.parent, 'reviewer', 'Task', new AbortController().signal), error => error.code === 'CODEX_ROLE_NO_SPAWN_PROVIDER')
    assert.equal(modelLookups, 0)
    assert.equal(starts, 0)
    h.ctx.subagents.getProvider = () => ({ name: 'spawn' })
    assert.deepEqual(JSON.parse(await h.bridge.run(h.parent, 'reviewer', 'Task', new AbortController().signal)), { answer: 'recovered' })
    assert.equal(modelLookups, 1)
    assert.equal(starts, 1)
    assert.equal(disposed, 1)
  } finally { await h.bridge.close() }
})

test('role compiler maps only equivalent routing fields', () => {
  const compiled = compileRole(role({ model: 'model-id', model_reasoning_effort: 'high' }))
  assert.equal(compiled.instructions, 'Review carefully.')
  assert.equal(compiled.agentOptions.model, 'model-id')
  assert.equal(compiled.agentOptions.reasoningEffort, 'high')
})
test('non-equivalent role policies fail closed and instruction text stays literal', () => {
  for (const field of ['sandbox_mode', 'approval_policy', 'skills', 'mcp_servers']) {
    assert.throws(() => compileRole(role({ [field]: {} })), /No child was started/)
  }
  assert.equal(compileRole({ ...role({}), developerInstructions: '{{ literal }}' }).instructions, '{{ literal }}')
  assert.throws(() => compileRole(role({ unsupported_configuration: true })), /unsupported runtime configuration/)
})
test('role tool does not delegate rejected policies', async t => {
  const tools = new Map()
  let started = 0
  const parent = { id: 'parent' }
  const disposers = []
  t.after(async () => { for (const dispose of disposers.reverse()) await dispose() })
  const ctx = { effect: callback => disposers.push(callback()), tools: { register: tool => tools.set(tool.name, tool) }, agents: { get: () => parent }, subagents: { startActivation: () => { started++; throw new Error('unexpected start') } } }
  const runtime = { options: () => ({ enabled: true, agents: true }), catalog: async () => ({ agents: [role({ skills: [] })] }) }
  registerAgentTools(ctx, runtime)
  await assert.rejects(tools.get('codex_agent').execute({ role: 'reviewer', prompt: 'Review' }, { agent: parent, signal: new AbortController().signal }), /No child was started/)
  assert.equal(started, 0)
})
