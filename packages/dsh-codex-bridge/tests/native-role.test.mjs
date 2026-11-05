import test from 'node:test'
import { executeTool } from './tool-batch.mjs'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { parse, stringify } from 'yaml'

// Exact declared native implementations, never a user's profile. An explicit
// extracted artifact override must resolve the same host scope identity.
const implementations = process.env.DSH_NATIVE_IMPLEMENTATION_ROOT ?? 'installed'
const artifact = process.env.CODEX_BRIDGE_ARTIFACT_DIR
const manifestUrl = artifact ? pathToFileURL(join(resolve(artifact), 'package.json')) : new URL('../package.json', import.meta.url)
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))
const target = manifest.devDependencies['@deepseek-ai/dsh-agent']
const hostEntry = new URL(manifest.exports['.'].default, manifestUrl).href
const require = createRequire(manifestUrl)
const agentRequire = createRequire(require.resolve('@deepseek-ai/dsh-agent'))
const moduleUrl = name => pathToFileURL(require.resolve(name)).href
const seamUrl = name => pathToFileURL(agentRequire.resolve(name)).href
const { Loader } = await import(pathToFileURL(createRequire(require.resolve('@deepseek-ai/cordis')).resolve('@deepseek-ai/cordis-plugin-loader')).href)

test('native Loader role uses real Agent loop/spawn with scripted model and in-memory sessions', { timeout: 15000 }, async t => {
  const native = async name => {
    const manifestPath = implementations === 'installed'
      ? require.resolve('@deepseek-ai/' + name + '/package.json')
      : join(resolve(implementations), name, 'package.json')
    const nativeRequire = createRequire(manifestPath)
    const toolsRequire = createRequire(require.resolve('@deepseek-ai/dsh-tools'))
    assert.equal(await realpath(nativeRequire.resolve('@deepseek-ai/dsh-scope')), await realpath(toolsRequire.resolve('@deepseek-ai/dsh-scope')), 'native implementations and tools must share the exact scope module, not just its version')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    assert.equal(manifest.version, target, 'native implementation must match the target exactly')
    assert.equal(manifest.name, '@deepseek-ai/' + name)
    return new URL('./lib/index.js', pathToFileURL(manifestPath)).href
  }
  const root = await mkdtemp(join(tmpdir(), 'codex-native-role-'))
  const ctx = new Context()
  const loader = ctx.plugin(Loader, { baseUrl: pathToFileURL(root + '/').href })
  let parent, depthLimitedParent, inheritanceParent, scopePeer
  try {
    await loader.await()
    const home = join(root, 'home')
    await mkdir(join(home, 'agents'), { recursive: true })
    const configContent = '[agents.reviewer]\nconfig_file = "agents/reviewer.toml"\ndescription = "Native fixture reviewer"\n[agents.inherited]\nconfig_file = "agents/inherited.toml"\ndescription = "Inherit the current parent step route"\n'
    const roleContent = 'developer_instructions = "Review carefully: NATIVE_ROLE_PERSONA."\nmodel = "role-model"\n'
    await writeFile(join(home, 'config.toml'), configContent)
    await writeFile(join(home, 'agents/reviewer.toml'), roleContent)
    const inheritedRoleContent = 'developer_instructions = "NATIVE_INHERITED_PERSONA: inherit the parent route."\n'
    await writeFile(join(home, 'agents/inherited.toml'), inheritedRoleContent)
    await writeFile(join(home, 'AGENTS.md'), 'NATIVE_HOME_GUIDANCE: preserve workspace precedence.\n')
    const scripted = join(root, 'scripted.mjs')
    await writeFile(scripted, `import assert from 'node:assert/strict';
import { LlmAdapter } from ${JSON.stringify(moduleUrl('@deepseek-ai/dsh-llm'))};
export const inject = ['llm'];
export function apply(ctx) {
  let inheritanceCalls = 0, peerCalls = 0;
  async function* call(id, name, args) {
    const argumentsText = JSON.stringify(args);
    yield { type: 'block-start', index: 0, blockType: 'tool-call' };
    yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsText };
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsText } };
    yield { type: 'finish', reason: { kind: 'tool-calls' } };
  }
  class Scripted extends LlmAdapter {
    async *stream(options) {
      ctx.emit('fixture/request', options);
      if (JSON.stringify(options.messages).includes('WAIT_FOR_CANCEL')) {
        if (!options.signal.aborted) await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }));
        throw options.signal.reason ?? new Error('fixture cancelled');
      }
      let text = 'Native role fixture completed.';
      if (JSON.stringify(options.messages).includes('NATIVE_INHERITED_PERSONA')) {
        assert.equal(options.provider, 'selected-provider');
        assert.equal(options.model, 'selected-model');
        text = 'NATIVE_INHERITED_CHILD_OK';
      } else if (options.model === 'selected-model') {
        assert.equal(options.provider, 'selected-provider');
        assert.equal(options.tools.some(tool => tool.name === 'codex_home_catalog'), false, 'denied catalog must not enter the parent schema set');
        inheritanceCalls++;
        if (inheritanceCalls === 1) { yield* call('denied-in-loop', 'codex_home_catalog', {}); return; }
        const denied = options.messages.find(message => message.role === 'tool' && message.toolCallId === 'denied-in-loop');
        assert.equal(denied?.isError, true, 'the real loop must reject a model-issued call outside its scoped toolSet');
        assert.equal(JSON.stringify(denied.content).includes('policyCompatible'), false, 'denied catalog must not execute its successful body');
        if (inheritanceCalls === 2) { yield* call('inherit-in-loop', 'codex_agent', { role: 'inherited', prompt: 'Return the inherited-route result.' }); return; }
        assert.equal(inheritanceCalls, 3);
        const childResult = options.messages.find(message => message.role === 'tool' && message.toolCallId === 'inherit-in-loop');
        assert.notEqual(childResult?.isError, true);
        assert.ok(JSON.stringify(childResult?.content).includes('NATIVE_INHERITED_CHILD_OK'), 'actual child output must return to the parent request');
        text = 'NATIVE_PARENT_COMPLETED';
      } else if (options.model === 'scope-peer-model') {
        assert.equal(options.tools.some(tool => tool.name === 'codex_home_catalog'), true, 'another Agent must retain its catalog schema');
        peerCalls++;
        if (peerCalls === 1) { yield* call('allowed-in-peer-loop', 'codex_home_catalog', {}); return; }
        assert.equal(peerCalls, 2);
        const catalog = options.messages.find(message => message.role === 'tool' && message.toolCallId === 'allowed-in-peer-loop');
        assert.notEqual(catalog?.isError, true);
        assert.ok(JSON.stringify(catalog?.content).includes('policyCompatible'), 'the peer must receive the real successful catalog body');
        text = 'NATIVE_PEER_COMPLETED';
      }
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text };
      yield { type: 'block-end', index: 0, block: { type: 'text', text } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['scripted', 'created-provider', 'selected-provider'], new Scripted());
}
`)
    const requests = [], starts = [], ends = [], childHeaders = []
    ctx.on('fixture/request', options => { requests.push(options) })
    ctx.on('subagent/start', event => {
      starts.push(event)
      const child = ctx.agents.get(event.id)
      assert.ok(child, 'native child must be published before the start event')
      childHeaders.push(child.session.header)
    })
    ctx.on('subagent/end', event => { ends.push(event) })
    const config = [
      { id: 'agents', name: moduleUrl('@deepseek-ai/dsh-agent') },
      { id: 'sessions', name: seamUrl('@deepseek-ai/dsh-session') },
      { id: 'projections', name: seamUrl('@deepseek-ai/dsh-session-projection') },
      { id: 'skills', name: moduleUrl('@deepseek-ai/dsh-skill') },
      { id: 'system-prompt', name: seamUrl('@deepseek-ai/dsh-system-prompt') },
      { id: 'tools', name: moduleUrl('@deepseek-ai/dsh-tools') },
      { id: 'executor', name: moduleUrl('@deepseek-ai/dsh-tool-executor-native') },
      { id: 'llm', name: moduleUrl('@deepseek-ai/dsh-llm') },
      { id: 'fs', name: moduleUrl('@deepseek-ai/dsh-fs-local') },
      { id: 'working-directory', name: moduleUrl('@deepseek-ai/dsh-working-directory'), config: { defaultDirectory: root } },
      { id: 'scripted', name: pathToFileURL(scripted).href },
      { id: 'loop', name: await native('dsh-agent-loop') },
      { id: 'subagents', name: moduleUrl('@deepseek-ai/dsh-subagent') },
      { id: 'spawn', name: await native('dsh-subagent-spawn-in-process') },
      { id: 'bridge', name: hostEntry, config: { home, enabled: true } },
    ]
    const configFile = join(root, 'cordis.yml')
    await writeFile(configFile, stringify(config))
    await ctx.loader.root.update(parse(await readFile(configFile, 'utf8')))
    await ctx.loader.await()
    assert.ok(ctx.subagents.getProvider('spawn'))
    assert.ok(ctx.tools.get('codex_agent'))
    assert.equal(ctx.sessionPersistence, undefined, 'only test-owned in-memory logs, not a user-state backend')
    parent = await ctx.agents.create({ sessionId: 'native-fixture-parent', meta: { cwd: root }, agentOptions: { provider: 'scripted', model: 'stale-created-model' } })
    parent.agent.model.select({ provider: 'scripted', model: 'parent-model' })
    const { createUserMessage } = await import(moduleUrl('@deepseek-ai/dsh-llm'))
    parent.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Resolve the selected parent route before delegation.' }] }))
    await parent.agent.whenIdle()
    assert.equal(requests.length, 1)
    assert.equal(requests[0].model, 'parent-model', 'the parent turn must use the selected route, not creation options')
    assert.ok(JSON.stringify(requests[0].messages).includes('NATIVE_HOME_GUIDANCE'))
    assert.equal(parent.agent.session.requestHeader().config.model, 'parent-model')
    requests.length = 0
    await ctx.loader.update('subagents', { config: { maxDepth: 0 } })
    await ctx.loader.await()
    const deniedRoot = await executeTool(ctx, { name: 'codex_agent', callId: 'native-role-depth-zero', arguments: { role: 'reviewer', prompt: 'Do not start this child.' }, agent: parent.agent, signal: t.signal })
    assert.equal(deniedRoot.isError, true)
    assert.match(JSON.stringify(deniedRoot.content), /subagent depth 1 exceeds maxDepth 0/u)
    assert.equal(requests.length, 0, 'forbidden depth must not reach the real model adapter')
    assert.equal(starts.length, 0, 'forbidden depth must not publish a real child')
    await ctx.loader.update('subagents', { config: { maxDepth: 1 } })
    await ctx.loader.await()
    const output = await executeTool(ctx, { name: 'codex_agent', callId: 'native-role', arguments: { role: 'reviewer', prompt: 'Perform the native fixture review.' }, agent: parent.agent, signal: t.signal })
    assert.equal(output.isError, false, JSON.stringify(output.content))
    assert.match(JSON.stringify(output.content), /Native role fixture completed/)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].provider, 'scripted')
    assert.equal(requests[0].model, 'role-model')
    assert.match(JSON.stringify(requests[0].messages), /NATIVE_ROLE_PERSONA/)
    assert.match(JSON.stringify(requests[0].messages), /NATIVE_HOME_GUIDANCE/)
    const unrestrict = parent.agent.ctx.tools.restrict({ deny: ['codex_home_catalog'] })
    try {
      const scoped = await executeTool(ctx, { name: 'codex_home_catalog', callId: 'scoped-catalog', arguments: {}, agent: parent.agent, signal: t.signal })
      assert.equal(scoped.isError, true, 'the Bridge tool must respect the calling Agent scope')
      const global = await executeTool(ctx, { name: 'codex_home_catalog', callId: 'global-catalog', arguments: {}, signal: t.signal })
      assert.equal(global.isError, false, 'an Agent restriction must not affect standalone catalog reads')
    } finally { unrestrict() }
    assert.match(JSON.stringify(requests[0].messages), /Perform the native fixture review/)
    assert.equal(starts.length, 1)
    assert.equal(ends.length, 1)
    assert.equal(starts[0].runId, ends[0].runId)
    assert.equal(starts[0].id, ends[0].id)
    assert.equal(starts[0].provider, 'spawn')
    assert.equal(starts[0].local, true)
    assert.equal(ends[0].stopReason, 'completed')
    assert.equal(childHeaders[0].cwd, root)
    assert.equal(childHeaders[0].parentSession, parent.agent.session.id)
    assert.equal(childHeaders[0].origin, 'subagent')
    assert.equal(childHeaders[0].delegationDepth, 1)
    assert.equal(ctx.agents.get(starts[0].id), undefined, 'one-shot child must unregister after RoleBridge finally')
    depthLimitedParent = await ctx.agents.create({ sessionId: 'native-fixture-depth-limited', meta: { cwd: root, delegationDepth: 1 }, agentOptions: { provider: 'scripted', model: 'parent-model', subagentDepth: 0 } })
    const deniedNested = await executeTool(ctx, { name: 'codex_agent', callId: 'native-role-depth-cap', arguments: { role: 'reviewer', prompt: 'Do not exceed the host cap.' }, agent: depthLimitedParent.agent, signal: t.signal })
    assert.equal(deniedNested.isError, true)
    assert.match(JSON.stringify(deniedNested.content), /subagent depth 2 exceeds maxDepth 1/u)
    assert.equal(requests.length, 1, 'persisted depth cannot be reset by fresh runtime options')
    assert.equal(starts.length, 1)
    // No fake Agent factory, spawn provider, tools executor, or RoleBridge.
    assert.equal(await readFile(join(home, 'config.toml'), 'utf8'), configContent)
    assert.equal(await readFile(join(home, 'agents/reviewer.toml'), 'utf8'), roleContent)
    // A real parent tool-call, not direct tools.execute(), must inherit the
    // prepared step route even when its creation options name another provider.
    const completedEvents = []
    const offEvents = ctx.on('session/event', (session, event) => {
      if (session.id === 'native-route-parent' || session.id === 'native-scope-peer') completedEvents.push(event)
    })
    inheritanceParent = await ctx.agents.create({ sessionId: 'native-route-parent', meta: { cwd: root }, agentOptions: { provider: 'created-provider', model: 'created-model' } })
    inheritanceParent.agent.model.select({ provider: 'selected-provider', model: 'selected-model' })
    const releaseScope = inheritanceParent.agent.ctx.tools.restrict({ deny: ['codex_home_catalog'] })
    try {
      const firstRequest = requests.length
      inheritanceParent.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Exercise scoped tools and delegate using the selected step route.' }] }))
      await inheritanceParent.agent.whenIdle()
      const routeRequests = requests.slice(firstRequest)
      assert.equal(routeRequests.length, 4, 'denied tool, delegation, child, and parent completion must all execute')
      assert.deepEqual(routeRequests.map(request => [request.provider, request.model]), Array.from({ length: 4 }, () => ['selected-provider', 'selected-model']))
      assert.equal(routeRequests[2].messages.some(message => JSON.stringify(message).includes('NATIVE_INHERITED_PERSONA')), true)
      const delivered = routeRequests[3].messages.find(message => message.role === 'tool' && message.toolCallId === 'inherit-in-loop')
      assert.notEqual(delivered?.isError, true)
      assert.match(JSON.stringify(delivered?.content), /NATIVE_INHERITED_CHILD_OK/u)
      assert.equal(inheritanceParent.agent.options.provider, 'created-provider')
      assert.equal(inheritanceParent.agent.options.model, 'created-model')
      assert.equal(inheritanceParent.agent.session.requestHeader().config.provider, 'selected-provider')
      assert.equal(inheritanceParent.agent.session.requestHeader().config.model, 'selected-model')
      assert.match(JSON.stringify(completedEvents), /NATIVE_PARENT_COMPLETED/u)
      // Keep the first Agent's deny active while a different real Agent dispatches
      // the very same catalog tool through its own complete loop.
      scopePeer = await ctx.agents.create({ sessionId: 'native-scope-peer', meta: { cwd: root }, agentOptions: { provider: 'scripted', model: 'scope-peer-model' } })
      const beforePeer = requests.length
      scopePeer.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Read the actual catalog in this unrestricted Agent.' }] }))
      await scopePeer.agent.whenIdle()
      assert.equal(requests.length - beforePeer, 2)
      const catalogResult = requests.at(-1).messages.find(message => message.role === 'tool' && message.toolCallId === 'allowed-in-peer-loop')
      assert.notEqual(catalogResult?.isError, true)
      assert.match(JSON.stringify(catalogResult?.content), /policyCompatible/u)
      assert.match(JSON.stringify(completedEvents), /NATIVE_PEER_COMPLETED/u)
      assert.equal(await readFile(join(home, 'agents/inherited.toml'), 'utf8'), inheritedRoleContent)
    } finally { releaseScope(); offEvents() }
    const entered = new Promise(resolve => {
      const off = ctx.on('fixture/request', options => {
        if (JSON.stringify(options.messages).includes('WAIT_FOR_CANCEL')) { off(); resolve(options.signal) }
      })
    })
    const pending = executeTool(ctx, { name: 'codex_agent', callId: 'native-role-cancel', arguments: { role: 'reviewer', prompt: 'WAIT_FOR_CANCEL' }, agent: parent.agent, signal: t.signal })
    const modelSignal = await entered
    const bridgeFiber = ctx.loader.resolve('bridge').fiber
    ctx.loader.remove('bridge')
    await ctx.loader.await()
    await bridgeFiber.dispose()
    const cancelled = await pending
    assert.equal(cancelled.isError, true, 'unload cannot publish a successful late role result')
    assert.ok(modelSignal.aborted, 'unload must reach the actual child model request')
    assert.equal(starts.length, 3)
    assert.equal(ends.length, 3)
    assert.equal(starts[2].runId, ends[2].runId)
    assert.equal(ends[2].stopReason, 'aborted')
    assert.equal(ctx.agents.get(starts[2].id), undefined)
    // Cordis nested injection contribution cleanup completes on the next turn.
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(ctx.tools.get('codex_agent'), undefined)
    assert.equal(await readFile(join(home, 'agents/reviewer.toml'), 'utf8'), roleContent)
  } finally {
    await scopePeer?.dispose()
    await inheritanceParent?.dispose()
    await depthLimitedParent?.dispose()
    await parent?.dispose()
    ctx.loader.root.stop()
    await ctx.loader.await()
    await loader.dispose()
    assert.ok(root.startsWith(join(tmpdir(), 'codex-native-role-')))
    await rm(root, { recursive: true, force: true })
  }
})
