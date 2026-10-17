import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { McpBridge, mcpServerName } from '../lib/mcp.js'

const require = createRequire(import.meta.url)
const toolsRequire = createRequire(require.resolve('@deepseek-ai/dsh-tools'))
const { SystemPrompt } = await import(pathToFileURL(toolsRequire.resolve('@deepseek-ai/dsh-system-prompt')).href)

test('real rc.2 Streamable HTTP MCP calls, revokes and unregisters its tools', { timeout: 15000 }, async t => {
  const requests = []
  const calls = []
  const sessionId = 'credential-free-fixture'
  const server = createServer(async (req, res) => {
    requests.push({ method: req.method, session: req.headers['mcp-session-id'] })
    if (req.method === 'DELETE') { res.writeHead(200); res.end(); return }
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
    let body = ''
    for await (const chunk of req) body += chunk
    const request = JSON.parse(body)
    if (request.id === undefined) { res.writeHead(202); res.end(); return }
    if (request.method === 'server/discover') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Legacy fixture' } }))
      return
    }
    let result
    if (request.method === 'initialize') {
      result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'http-fixture', version: '1' } }
    } else if (request.method === 'tools/list') {
      result = { tools: [{ name: 'echo', description: 'HTTP fixture echo', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } }] }
    } else if (request.method === 'tools/call') {
      calls.push(request.params)
      result = { content: [{ type: 'text', text: `http-echo:${request.params.arguments.text}` }] }
    } else { res.writeHead(400); res.end(); return }
    res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': sessionId })
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }))
  })
  const ctx = new Context()
  const fibers = []
  let bridge
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    fibers.push(ctx.plugin(SystemPrompt, {}))
    await fibers.at(-1).await()
    fibers.push(ctx.plugin(ToolRuntime, {}))
    await fibers.at(-1).await()
    const options = { home: '/fixture-home', enabled: true, connectMcp: true, plugins: true }
    const row = { id: 'http:echo', name: 'http-fixture', root: '/fixture-home', source: 'fixture', enabled: true, config: { url: `http://127.0.0.1:${server.address().port}/mcp` } }
    const name = `mcp__${mcpServerName(row.id)}__echo`
    bridge = new McpBridge(ctx, { options: () => options, catalog: async () => ({ mcp: [row] }) })
    const discovered = new Promise((resolve, reject) => {
      const abort = () => { off(); reject(t.signal.reason) }
      const off = ctx.on('tools/change', () => {
        if (ctx.tools.get(name)) { off(); t.signal.removeEventListener('abort', abort); resolve() }
      })
      t.signal.addEventListener('abort', abort, { once: true })
    })
    await bridge.reconcile()
    await discovered
    const call = text => ctx.tools.execute({ callId: 'http-fixture-call', name, arguments: { text }, signal: t.signal })
    const result = await call('first')
    assert.equal(result.isError, false)
    assert.ok(JSON.stringify(result.content).includes('http-echo:first'))
    assert.deepEqual(calls.map(call => call.arguments), [{ text: 'first' }])
    assert.ok(requests.some(request => request.method === 'POST' && request.session === sessionId))
    options.connectMcp = false
    const denied = await call('revoked')
    assert.equal(denied.isError, true)
    assert.equal(calls.length, 1)
    await bridge.reconcile()
    assert.equal(ctx.tools.get(name), undefined)
    assert.deepEqual(bridge.snapshot(), [])
    // rc.2 closes the local client transport; it does not send HTTP DELETE to
    // terminate server-side sessions. Do not claim remote session destruction.
    const requestCount = requests.length
    const removed = await call('after-disposal')
    assert.equal(removed.isError, true)
    assert.equal(requests.length, requestCount)
    assert.equal(calls.length, 1)
  } finally {
    await bridge?.close()
    for (const fiber of fibers.reverse()) await fiber.dispose()
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
