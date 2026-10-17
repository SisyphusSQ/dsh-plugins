import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { parse, stringify } from 'yaml'

// Explicit opt-in to exact native implementations, never to a user's profile.
// The ordinary dependency cohort only supplies AgentRegistry/SubagentRuntime seams.
const implementations = process.env.DSH_NATIVE_IMPLEMENTATION_ROOT
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

test('native Loader role uses real Agent loop/spawn with scripted model and in-memory sessions', { skip: !implementations, timeout: 15000 }, async t => {
  const native = async name => {
    const directory = join(resolve(implementations), name)
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
    assert.equal(manifest.version, target, 'native implementation must match the target exactly')
    assert.equal(manifest.name, '@deepseek-ai/' + name)
    return pathToFileURL(join(directory, 'lib/index.js')).href
  }
  const root = await mkdtemp(join(tmpdir(), 'codex-native-role-'))
  const ctx = new Context()
  const loader = ctx.plugin(Loader, { baseUrl: pathToFileURL(root + '/').href })
  let parent
  try {
    await loader.await()
    const home = join(root, 'home')
    await mkdir(join(home, 'agents'), { recursive: true })
    const configContent = '[agents.reviewer]\nconfig_file = "agents/reviewer.toml"\ndescription = "Native fixture reviewer"\n'
    const roleContent = 'developer_instructions = "Review carefully: NATIVE_ROLE_PERSONA."\nmodel = "role-model"\n'
    await writeFile(join(home, 'config.toml'), configContent)
    await writeFile(join(home, 'agents/reviewer.toml'), roleContent)
    const scripted = join(root, 'scripted.mjs')
    await writeFile(scripted, `import { LlmAdapter } from ${JSON.stringify(moduleUrl('@deepseek-ai/dsh-llm'))};
export const inject = ['llm'];
export function apply(ctx) {
  class Scripted extends LlmAdapter {
    async *stream(options) {
      ctx.emit('fixture/request', options);
      if (JSON.stringify(options.messages).includes('WAIT_FOR_CANCEL')) {
        if (!options.signal.aborted) await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }));
        throw options.signal.reason ?? new Error('fixture cancelled');
      }
      const text = 'Native role fixture completed.';
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text };
      yield { type: 'block-end', index: 0, block: { type: 'text', text } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['scripted'], new Scripted());
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
    parent = await ctx.agents.create({ sessionId: 'native-fixture-parent', meta: { cwd: root }, agentOptions: { provider: 'scripted', model: 'parent-model' } })
    const output = await ctx.tools.execute({ name: 'codex_agent', callId: 'native-role', arguments: { role: 'reviewer', prompt: 'Perform the native fixture review.' }, agent: parent.agent, signal: t.signal })
    assert.equal(output.isError, false, JSON.stringify(output.content))
    assert.match(JSON.stringify(output.content), /Native role fixture completed/)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].provider, 'scripted')
    assert.equal(requests[0].model, 'role-model')
    assert.match(JSON.stringify(requests[0].messages), /NATIVE_ROLE_PERSONA/)
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
    // No fake Agent factory, spawn provider, tools executor, or RoleBridge.
    assert.equal(await readFile(join(home, 'config.toml'), 'utf8'), configContent)
    assert.equal(await readFile(join(home, 'agents/reviewer.toml'), 'utf8'), roleContent)
    const entered = new Promise(resolve => {
      const off = ctx.on('fixture/request', options => {
        if (JSON.stringify(options.messages).includes('WAIT_FOR_CANCEL')) { off(); resolve(options.signal) }
      })
    })
    const pending = ctx.tools.execute({ name: 'codex_agent', callId: 'native-role-cancel', arguments: { role: 'reviewer', prompt: 'WAIT_FOR_CANCEL' }, agent: parent.agent, signal: t.signal })
    const modelSignal = await entered
    const bridgeFiber = ctx.loader.resolve('bridge').fiber
    ctx.loader.remove('bridge')
    await ctx.loader.await()
    await bridgeFiber.dispose()
    const cancelled = await pending
    assert.equal(cancelled.isError, true, 'unload cannot publish a successful late role result')
    assert.ok(modelSignal.aborted, 'unload must reach the actual child model request')
    assert.equal(starts.length, 2)
    assert.equal(ends.length, 2)
    assert.equal(starts[1].runId, ends[1].runId)
    assert.equal(ends[1].stopReason, 'aborted')
    assert.equal(ctx.agents.get(starts[1].id), undefined)
    // Cordis nested injection contribution cleanup completes on the next turn.
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(ctx.tools.get('codex_agent'), undefined)
    assert.equal(await readFile(join(home, 'agents/reviewer.toml'), 'utf8'), roleContent)
  } finally {
    await parent?.dispose()
    ctx.loader.root.stop()
    await ctx.loader.await()
    await loader.dispose()
    assert.ok(root.startsWith(join(tmpdir(), 'codex-native-role-')))
    await rm(root, { recursive: true, force: true })
  }
})
