import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileRole, registerAgentTools, RoleBridge } from '../lib/agents.js'
import { SubagentDepthError } from '@deepseek-ai/dsh-subagent'

const role = config => ({ name: 'reviewer', description: 'Review code', path: '/home/agents/reviewer.toml', developerInstructions: 'Review carefully.', config })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function harness(startActivation, roleConfig = {}) {
  let options = { enabled: true, agents: true, home: '/fixture' }
  let maxDepth = 1
  const parent = { id: 'parent', options: { provider: 'fixture-provider', model: 'fixture-model' }, session: { header: {}, requestHeader: () => undefined } }
  const ctx = { agents: { get: () => parent }, subagents: { startActivation, getProvider: () => ({ name: 'spawn' }), resolveMaxDepth: () => maxDepth }, llm: { resolveModelInfo: async () => ({}) } }
  const runtime = { options: () => options, catalog: async () => ({ agents: [role(roleConfig)] }) }
  return { bridge: new RoleBridge(ctx, runtime), parent, ctx, set: edit => { options = { ...options, ...edit } }, setMaxDepth: value => { maxDepth = value } }
}

// Replacing the host cap with undefined must admit these forbidden children and
// make these cases red, before any provider lookup can perform model I/O.
for (const { name, cap, persisted, runtime, attempted } of [
  { name: 'zero host depth cap denies a root delegation', cap: 0, persisted: 0, runtime: 0, attempted: 1 },
  { name: 'a parent at the host cap cannot delegate again', cap: 1, persisted: 1, runtime: 0, attempted: 2 },
  { name: 'a resumed parent already above the cap cannot lower its persisted depth', cap: 2, persisted: 3, runtime: 0, attempted: 4 },
  { name: 'runtime depth can deepen the persisted parent depth', cap: 2, persisted: 0, runtime: 2, attempted: 3 },
]) {
  test(name, async () => {
    let starts = 0, modelLookups = 0
    const h = harness(async () => {
      starts++
      return { result: Promise.resolve({ answer: 'must not start' }), dispose: async () => {} }
    }, { model: 'other-model' })
    h.setMaxDepth(cap)
    h.parent.session.header.delegationDepth = persisted
    h.parent.options.subagentDepth = runtime
    h.ctx.llm.resolveModelInfo = async () => { modelLookups++; return {} }
    try {
      await assert.rejects(h.bridge.run(h.parent, 'reviewer', 'Task', new AbortController().signal), error => {
        assert.ok(error instanceof SubagentDepthError)
        assert.equal(error.attemptedDepth, attempted)
        assert.equal(error.maxDepth, cap)
        return true
      })
      assert.equal(modelLookups, 0, 'a rejected depth must not contact the model provider')
      assert.equal(starts, 0, 'a rejected depth must not start an activation')
    } finally { await h.bridge.close() }
  })
}

test('legal delegation at the host cap passes the same numeric cap to activation', async () => {
  let spec
  const h = harness(async value => {
    spec = value
    return { result: Promise.resolve({ answer: 'at boundary' }), dispose: async () => {} }
  })
  h.parent.session.header.delegationDepth = 1
  h.setMaxDepth(2)
  try {
    assert.deepEqual(JSON.parse(await h.bridge.run(h.parent, 'reviewer', 'Task', new AbortController().signal)), { answer: 'at boundary' })
    assert.equal(spec.request.maxDepth, 2)
  } finally { await h.bridge.close() }
})

test('each delegation observes the current host depth cap without remounting the bridge', async () => {
  const caps = []
  const h = harness(async spec => {
    caps.push(spec.request.maxDepth)
    return { result: Promise.resolve({ answer: 'allowed' }), dispose: async () => {} }
  })
  try {
    await h.bridge.run(h.parent, 'reviewer', 'First', new AbortController().signal)
    h.setMaxDepth(0)
    await assert.rejects(h.bridge.run(h.parent, 'reviewer', 'Denied', new AbortController().signal), SubagentDepthError)
    h.setMaxDepth(2)
    h.parent.session.header.delegationDepth = 1
    await h.bridge.run(h.parent, 'reviewer', 'Allowed again', new AbortController().signal)
    assert.deepEqual(caps, [1, 2], 'only allowed operations reach activation, each with its current cap')
  } finally { await h.bridge.close() }
})

test('a delegation captures one host cap for preflight and activation across model lookup', async () => {
  const entered = deferred(), release = deferred()
  let reads = 0, spec
  const h = harness(async value => {
    spec = value
    return { result: Promise.resolve({ answer: 'captured' }), dispose: async () => {} }
  }, { model: 'other-model' })
  let cap = 2
  h.ctx.subagents.resolveMaxDepth = configured => { assert.equal(configured, undefined); reads++; return cap }
  h.ctx.llm.resolveModelInfo = async () => { entered.resolve(); await release.promise }
  h.parent.session.header.delegationDepth = 1
  try {
    const pending = h.bridge.run(h.parent, 'reviewer', 'Task', new AbortController().signal)
    await entered.promise
    cap = 0
    release.resolve()
    assert.deepEqual(JSON.parse(await pending), { answer: 'captured' })
    assert.equal(reads, 1, 'preflight and activation must not resolve different cap values')
    assert.equal(spec.request.maxDepth, 2, 'activation must retain the cap that admitted this operation')
    await assert.rejects(h.bridge.run(h.parent, 'reviewer', 'Next task', new AbortController().signal), SubagentDepthError)
    assert.equal(reads, 2, 'the next operation must see the updated cap')
  } finally { release.resolve(); await h.bridge.close() }
})
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
