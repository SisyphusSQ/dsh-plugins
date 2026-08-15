// Minimal MCP stdio server — newline-delimited JSON (MCP stdio transport).
// Tools: echo (returns the input message). Used by M3 E2E tests.
const readline = require('readline')
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  if (!line.trim()) return
  try { handle(JSON.parse(line)) } catch {}
})
function send(msg) { process.stdout.write(`${JSON.stringify(msg)}\n`) }
function handle(msg) {
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: msg.params?.protocolVersion ?? '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'echo-server', version: '1.0.0' } } })
  } else if (msg.method === 'notifications/initialized') {
    // no reply expected
  } else if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'echo', description: 'Echo back the message', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } }] } })
  } else if (msg.method === 'tools/call') {
    const args = msg.params?.arguments ?? {}
    send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `echo: ${String(args.message ?? '')}` }] } })
  } else {
    send({ jsonrpc: '2.0', id: msg.id, result: {} })
  }
}
