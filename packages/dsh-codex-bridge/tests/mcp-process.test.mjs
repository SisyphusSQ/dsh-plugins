import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { McpBridge, mcpServerName } from '../lib/mcp.js'

// Resolve the declared tools dependency rather than another workspace cohort.
const require = createRequire(import.meta.url)
const toolsRequire = createRequire(require.resolve('@deepseek-ai/dsh-tools'))
const { SystemPrompt } = await import(pathToFileURL(toolsRequire.resolve('@deepseek-ai/dsh-system-prompt')).href)

test('real rc.2 stdio MCP discovers, executes and revokes an owned fixture server', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'codex-mcp-test-'))
  const ctx = new Context()
  let bridge
  const fibers = []
  let pid
  try {
    const server = join(root, 'server.mjs')
    const calls = join(root, 'calls.jsonl')
    const pidFile = join(root, 'pid')
    await writeFile(server, `
import { createInterface } from 'node:readline';
import { appendFileSync, writeFileSync } from 'node:fs';
writeFileSync(process.argv[3], String(process.pid));
const send = (id, result) => process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\\n');
createInterface({input:process.stdin}).on('line', line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  if (request.method === 'initialize') send(request.id, {protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}});
  else if (request.method === 'tools/list') send(request.id,{tools:[{name:'echo',description:'Fixture echo',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}}]});
  else if (request.method === 'tools/call') {
    appendFileSync(process.argv[2],JSON.stringify(request.params)+'\\n');
    send(request.id,{content:[{type:'text',text:'echo:'+request.params.arguments.text}]});
  } else process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'unsupported'}})+'\\n');
});
`)
    fibers.push(ctx.plugin(SystemPrompt, {}))
    await fibers.at(-1).await()
    fibers.push(ctx.plugin(ToolRuntime, {}))
    await fibers.at(-1).await()
    const options = { enabled: true, connectMcp: true, plugins: true }
    const row = { id: 'fixture:echo', name: 'fixture', root, source: 'fixture', enabled: true, config: { command: process.execPath, args: [server, calls, pidFile] } }
    const name = `mcp__${mcpServerName(row.id)}__echo`
    const runtime = { options: () => options, catalog: async () => ({ mcp: [row] }) }
    bridge = new McpBridge(ctx, runtime)
    const discovered = new Promise((resolve, reject) => {
      const abort = () => { off(); reject(t.signal.reason) }
      const off = ctx.on('tools/change', () => {
        if (ctx.tools.get(name)) { off(); t.signal.removeEventListener('abort', abort); resolve() }
      })
      t.signal.addEventListener('abort', abort, { once: true })
    })
    await bridge.reconcile()
    await discovered
    pid = Number(await readFile(pidFile, 'utf8'))
    assert.ok(pid > 0)
    const call = text => ctx.tools.execute({ callId: 'fixture-call', name, arguments: { text }, signal: new AbortController().signal })
    const result = await call('first')
    assert.equal(result.isError, false)
    assert.ok(JSON.stringify(result.content).includes('echo:first'))
    const recorded = await readFile(calls, 'utf8')
    assert.equal(JSON.parse(recorded.trim()).arguments.text, 'first')
    options.connectMcp = false
    const denied = await call('revoked')
    assert.equal(denied.isError, true)
    assert.equal(await readFile(calls, 'utf8'), recorded)
    await bridge.reconcile()
    assert.equal(ctx.tools.get(name), undefined)
    assert.equal(bridge.snapshot().length, 0)
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
  } finally {
    await bridge?.close()
    for (const fiber of fibers.reverse()) await fiber.dispose()
    // Only the mkdtemp-owned fixture directory is removed.
    assert.equal(root.startsWith(join(tmpdir(), 'codex-mcp-test-')), true)
    await rm(root, { recursive: true, force: true })
  }
})
