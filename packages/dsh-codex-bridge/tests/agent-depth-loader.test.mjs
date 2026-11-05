import test from 'node:test'
import { executeTool } from './tool-batch.mjs'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parse, stringify } from 'yaml'

const require = createRequire(import.meta.url)
const moduleUrl = name => pathToFileURL(require.resolve(name)).href
const { Loader } = await import(pathToFileURL(createRequire(require.resolve('@deepseek-ai/cordis')).resolve('@deepseek-ai/cordis-plugin-loader')).href)
const systemPromptUrl = pathToFileURL(createRequire(require.resolve('@deepseek-ai/dsh-tools')).resolve('@deepseek-ai/dsh-system-prompt')).href

// The Loader, bridge entry, tool executor, AgentRegistry and SubagentRuntime are
// real. Only the live caller shape, directory and external execution are fixture
// boundaries; this is service-composition evidence, not a real Agent-loop E2E.
test('Loader role delegation follows volatile native subagent depth policy', { timeout: 10000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'codex-depth-loader-'))
  const ctx = new Context()
  const loader = ctx.plugin(Loader, { baseUrl: pathToFileURL(root + '/').href })
  const requests = []
  ctx.on('fixture/spawn-request', request => requests.push(request))
  try {
    await loader.await()
    const home = join(root, 'home')
    await mkdir(join(home, 'agents'), { recursive: true })
    const roleContent = 'developer_instructions = "Depth fixture role."\n'
    await writeFile(join(home, 'config.toml'), '[agents.reviewer]\nconfig_file = "agents/reviewer.toml"\ndescription = "Depth fixture reviewer"\n')
    await writeFile(join(home, 'agents/reviewer.toml'), roleContent)
    const fixture = join(root, 'fixture.mjs')
    await writeFile(fixture, `export const inject = ['agents', 'subagents'];
export function apply(ctx) {
  const parent = { id: 'depth-fixture-parent', ctx, options: { provider: 'fixture', model: 'fixture' }, session: { id: 'depth-fixture-parent', header: {}, requestHeader: () => undefined } };
  ctx.effect(() => ctx.agents.enter(parent, undefined));
  let sequence = 0;
  ctx.subagents.registerProvider({
    name: 'spawn', inheritsParentContext: false,
    capabilities: { agentOptions: true, agentPreset: false, outputSchema: false, depthLimit: true },
    async start(request) {
      ctx.emit('fixture/spawn-request', request);
      return { id: 'depth-fixture-child-' + ++sequence, result: Promise.resolve({ output: [{ type: 'text', text: 'Depth fixture completed.' }], stopReason: 'completed' }), dispose: async () => {} };
    },
  });
}
`)
    const directory = join(root, 'directory.mjs')
    await writeFile(directory, `export function apply(ctx) { ctx.provide('workingDirectory', { ensure: async () => ${JSON.stringify(root)} }); }\n`)
    const config = [
      { id: 'projections', name: moduleUrl('@deepseek-ai/dsh-session-projection') },
      { id: 'executor', name: moduleUrl('@deepseek-ai/dsh-tool-executor-native') },
      { id: 'agents', name: moduleUrl('@deepseek-ai/dsh-agent') },
      { id: 'skills', name: moduleUrl('@deepseek-ai/dsh-skill') },
      { id: 'system-prompt', name: systemPromptUrl },
      { id: 'tools', name: moduleUrl('@deepseek-ai/dsh-tools') },
      { id: 'llm', name: moduleUrl('@deepseek-ai/dsh-llm') },
      { id: 'directory', name: pathToFileURL(directory).href },
      { id: 'subagents', name: moduleUrl('@deepseek-ai/dsh-subagent'), config: { maxDepth: 0 } },
      { id: 'fixture', name: pathToFileURL(fixture).href },
      { id: 'bridge', name: new URL('../lib/index.js', import.meta.url).href, config: { home, enabled: true } },
    ]
    const configFile = join(root, 'cordis.yml')
    await writeFile(configFile, stringify(config))
    await ctx.loader.root.update(parse(await readFile(configFile, 'utf8')))
    await ctx.loader.await()
    await ctx.loader.resolve('fixture').fiber.await()
    assert.ok(ctx.tools.get('codex_agent'))
    const parent = ctx.agents.get('depth-fixture-parent')
    assert.ok(parent, `fixture must publish its caller (fiber state ${ctx.loader.resolve('fixture').fiber.state})`)
    const execute = callId => executeTool(ctx, { name: 'codex_agent', callId, arguments: { role: 'reviewer', prompt: 'Check depth.' }, agent: parent, signal: t.signal })
    const denied = await execute('depth-zero')
    assert.equal(denied.isError, true, 'native maxDepth=0 must deny a top-level role call')
    assert.match(JSON.stringify(denied.content), /subagent depth 1 exceeds maxDepth 0/u)
    assert.equal(requests.length, 0, 'denial must precede the execution boundary')
    const bridgeFiber = ctx.loader.resolve('bridge').fiber
    await ctx.loader.update('subagents', { config: { maxDepth: 1 } })
    await ctx.loader.await()
    assert.ok(ctx.loader.resolve('bridge').fiber === bridgeFiber, 'depth edits must not remount the bridge')
    const allowed = await execute('depth-one')
    assert.equal(allowed.isError, false, JSON.stringify(allowed.content))
    assert.deepEqual(JSON.parse(allowed.content.find(block => block.type === 'text').text), { output: [{ type: 'text', text: 'Depth fixture completed.' }], stopReason: 'completed' })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].maxDepth, 1, 'the native execution request must retain the resolved host cap')
    await ctx.loader.update('subagents', { config: { maxDepth: 0 } })
    await ctx.loader.await()
    assert.equal((await execute('depth-revoked')).isError, true)
    assert.equal(requests.length, 1)
    assert.equal(await readFile(join(home, 'agents/reviewer.toml'), 'utf8'), roleContent)
    ctx.loader.remove('bridge')
    await ctx.loader.await()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(ctx.tools.get('codex_agent'), undefined, 'the real tool registration must retract on unload')
  } finally {
    ctx.loader.root.stop()
    await ctx.loader.await()
    await loader.dispose()
    assert.ok(root.startsWith(join(tmpdir(), 'codex-depth-loader-')))
    await rm(root, { recursive: true, force: true })
  }
})
