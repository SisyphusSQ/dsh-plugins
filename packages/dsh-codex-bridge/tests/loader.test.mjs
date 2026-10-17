import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { renderSkillContent } from '@deepseek-ai/dsh-skill'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { mcpServerName } from '../lib/mcp.js'
import { parse, stringify } from 'yaml'

// Optional extracted artifact consumer: never redirect the published plugin's
// defaults. The caller supplies an already audited, credential-free package.
const artifact = process.env.CODEX_BRIDGE_ARTIFACT_DIR
const manifestUrl = artifact ? pathToFileURL(join(artifact, 'package.json')) : new URL('../package.json', import.meta.url)
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))
const hostEntry = new URL(manifest.exports['.'].default, manifestUrl).href
const require = createRequire(manifestUrl)
const cordisRequire = createRequire(require.resolve('@deepseek-ai/cordis'))
const { Loader } = await import(pathToFileURL(cordisRequire.resolve('@deepseek-ai/cordis-plugin-loader')).href)
const moduleUrl = name => pathToFileURL(require.resolve(name)).href
const toolsRequire = createRequire(require.resolve('@deepseek-ai/dsh-tools'))
const systemPromptUrl = pathToFileURL(toolsRequire.resolve('@deepseek-ai/dsh-system-prompt')).href

test('native Loader owns MCP authentication while the bridge ignores Codex grants and blocks auth imports', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'codex-loader-auth-test-'))
  const ctx = new Context()
  const fiber = ctx.plugin(Loader, { baseUrl: pathToFileURL(root + '/').href })
  const requests = []
  let unauthorizedRequests = 0
  const server = createServer(async (req, res) => {
    const expected = req.url === '/dsh' ? 'Bearer fixture-dsh-only' : undefined
    if (!['/plain', '/dsh'].includes(req.url) || req.headers.authorization !== expected) { unauthorizedRequests++; res.writeHead(401); res.end(); return }
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
    let body = ''
    for await (const chunk of req) body += chunk
    const request = JSON.parse(body)
    requests.push({ path: req.url, method: request.method })
    if (!('id' in request)) { res.writeHead(202); res.end(); return }
    if (request.method === 'server/discover') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Legacy fixture' } }))
      return
    }
    const result = request.method === 'initialize'
      ? { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'auth-fixture', version: '1' } }
      : request.method === 'tools/list' ? { tools: [{ name: 'read_fixture', inputSchema: { type: 'object' } }] }
        : { content: [{ type: 'text', text: 'authenticated-loader-result' }] }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }))
  })
  try {
    await fiber.await()
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const home = join(root, 'home')
    await mkdir(home)
    const url = `http://127.0.0.1:${server.address().port}`
    const original = JSON.stringify({ 'plain|0123456789abcdef': { server_name: 'plain', server_url: `${url}/plain`, issuer: url, client_id: 'fixture', access_token: 'fixture-oauth-only', expires_at: Date.now() + 60000, refresh_token: 'never-use-refresh', scopes: [] } })
    const credentialFile = join(home, '.credentials.json')
    await writeFile(credentialFile, original, { mode: 0o600 })
    await writeFile(join(home, 'config.toml'), `mcp_oauth_credentials_store = "file"\n[mcp_servers.plain]\nurl = "${url}/plain"\n[mcp_servers.oauth]\nurl = "${url}/oauth"\noauth_resource = "${url}/not-a-stored-binding"\n[mcp_servers.header]\nurl = "${url}/header"\n[mcp_servers.header.http_headers]\nX-Custom = "fixture-header-only"\n`)
    const config = [
      { id: 'agents', name: moduleUrl('@deepseek-ai/dsh-agent') }, { id: 'skills', name: moduleUrl('@deepseek-ai/dsh-skill') },
      { id: 'system-prompt', name: systemPromptUrl }, { id: 'tools', name: moduleUrl('@deepseek-ai/dsh-tools') },
      { id: 'bridge', name: hostEntry, config: { home, enabled: true, connectMcp: true } },
      // Native DSH configuration owns this separate authenticated connection.
      { id: 'dsh-mcp', name: moduleUrl('@deepseek-ai/dsh-mcp-client'), config: { serverName: 'dsh_fixture', transport: 'streamable-http', url: `${url}/dsh`, headers: { Authorization: 'Bearer fixture-dsh-only' }, reconnect: { enabled: false }, failOnStartupError: true } },
    ]
    const names = [`mcp__${mcpServerName('home:plain')}__read_fixture`, 'mcp__dsh_fixture__read_fixture']
    const discovered = new Promise((resolve, reject) => {
      const abort = () => { off(); reject(t.signal.reason) }
      const off = ctx.on('tools/change', () => { if (ctx.tools && names.every(name => ctx.tools.get(name))) { off(); t.signal.removeEventListener('abort', abort); resolve() } })
      t.signal.addEventListener('abort', abort, { once: true })
    })
    await ctx.loader.root.update(config)
    await ctx.loader.await()
    await discovered
    const outputs = []
    for (const name of names) {
      const output = await ctx.tools.execute({ name, callId: name, arguments: {}, signal: t.signal })
      assert.equal(output.isError, false)
      assert.match(JSON.stringify(output.content), /authenticated-loader-result/)
      outputs.push({ isError: output.isError, content: output.content })
    }
    const snapshot = {
      schemas: ctx.tools.schemas().filter(tool => names.includes(tool.name)).map(tool => ({ ...tool, name: tool.name === names[0] ? '<IMPORTED_TOOL>' : '<DSH_AUTH_TOOL>' })).sort((a, b) => a.name.localeCompare(b.name)),
      wire: ['/plain', '/dsh'].map(path => ({ path, methods: requests.filter(request => request.path === path).map(request => request.method) })),
      outputs,
    }
    const expected = JSON.parse(await readFile(new URL('./snapshots/loader-auth.json', import.meta.url), 'utf8'))
    assert.deepEqual(snapshot, expected, 'reviewed authenticated Loader schema/wire/result snapshot')
    assert.equal(requests.filter(request => request.method === 'tools/call').length, 2)
    assert.equal(await readFile(credentialFile, 'utf8'), original)
    const catalog = await ctx.tools.execute({ name: 'codex_home_catalog', callId: 'auth-catalog', arguments: {}, signal: t.signal })
    assert.ok(!JSON.stringify(catalog).includes('fixture-oauth-only'))
    assert.ok(!JSON.stringify(catalog).includes('fixture-header-only'))
    const catalogData = JSON.parse(catalog.content.find(item => item.type === 'text').text)
    for (const name of ['oauth', 'header']) {
      const item = catalogData.mcp.find(item => item.id === `home:${name}`)
      assert.equal(item.state, 'blocked')
      assert.match(item.reason, /independent DSH/)
      assert.equal(ctx.tools.get(`mcp__${mcpServerName(item.id)}__read_fixture`), undefined)
    }
    assert.equal(unauthorizedRequests, 0)
    assert.ok(requests.every(request => ['/plain', '/dsh'].includes(request.path)))
    await ctx.loader.update('bridge', { config: { home, enabled: true, connectMcp: false } })
    const denied = await ctx.tools.execute({ name: names[0], callId: 'revoked-import', arguments: {}, signal: t.signal })
    assert.equal(denied.isError, true)
    assert.equal(requests.filter(request => request.method === 'tools/call').length, 2)
    const bridgeFiber = ctx.loader.resolve('bridge').fiber
    ctx.loader.remove('bridge')
    // Loader.remove already invoked the disposer. Cordis repeated effect
    // disposal does not join its first call; Fiber.await joins lifecycle work.
    await bridgeFiber.await()
    await ctx.loader.await()
    assert.equal(ctx.tools.get(names[0]), undefined)
    assert.ok(ctx.tools.get(names[1]), 'native DSH auth connection is not owned by the bridge')
  } finally {
    ctx.loader.root.stop(); await ctx.loader.await(); await fiber.dispose()
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    assert.ok(root.startsWith(join(tmpdir(), 'codex-loader-auth-test-')))
    await rm(root, { recursive: true, force: true })
  }
})

test('native Loader mounts Home skill provider and commits volatile category changes', { timeout: 10000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'codex-loader-test-'))
  const ctx = new Context()
  const fiber = ctx.plugin(Loader, { baseUrl: pathToFileURL(root + '/').href })
  try {
    await fiber.await()
    const home = join(root, 'home')
    await mkdir(join(home, 'skills', 'fixture'), { recursive: true })
    const content = '---\nname: fixture\ndescription: Fixture skill\n---\nRead-only fixture body.\n'
    const skillFile = join(home, 'skills', 'fixture', 'SKILL.md')
    await writeFile(skillFile, content)
    const config = [
      { id: 'agents', name: moduleUrl('@deepseek-ai/dsh-agent') },
      { id: 'skills', name: moduleUrl('@deepseek-ai/dsh-skill') },
      { id: 'system-prompt', name: systemPromptUrl },
      { id: 'tools', name: moduleUrl('@deepseek-ai/dsh-tools') },
      { id: 'bridge', name: hostEntry, config: { home, enabled: true } },
    ]
    const configFile = join(root, 'cordis.yml')
    await writeFile(configFile, stringify(config))
    await ctx.loader.root.update(parse(await readFile(configFile, 'utf8')))
    await ctx.loader.await()
    const entry = ctx.loader.resolve('bridge')
    await entry.fiber.await()
    assert.equal(entry.fiber.state, 2) // target Cordis FiberState.ACTIVE
    const list = await ctx.skills.list()
    assert.equal(list.length, 1)
    assert.equal(list[0].provider, 'suqingsq-codex-bridge-home')
    assert.equal(ctx.subagents, undefined)
    assert.equal(ctx.llm, undefined)
    assert.ok(ctx.tools.get('codex_home_catalog'), 'catalog must not require subagents or llm')
    assert.equal(ctx.tools.get('codex_agent'), undefined, 'delegation must wait for its required services')
    const result = await ctx.tools.execute({ name: 'codex_home_catalog', callId: 'loader-catalog', arguments: {}, signal: t.signal })
    assert.equal(result.isError, false)
    assert.ok(JSON.stringify(result.content).includes(list[0].name))
    const catalogSnapshot = JSON.parse(await readFile(new URL('./snapshots/loader-catalog.json', import.meta.url), 'utf8'))
    const report = output => JSON.parse(output.content.filter(block => block.type === 'text').map(block => block.text).join(''))
    assert.deepEqual(report(result), catalogSnapshot.enabled, 'reviewed model-facing catalog snapshot')
    const definition = await ctx.skills.get(list[0].name)
    assert.ok(definition.content.includes('Read-only fixture body.'))
    const expected = await readFile(new URL('./snapshots/loader-skill.txt', import.meta.url), 'utf8')
    const canonicalHome = await realpath(home)
    const rendered = renderSkillContent(definition).replaceAll(canonicalHome, '<HOME>').replaceAll(home, '<HOME>')
    assert.equal(rendered + '\n', expected, 'reviewed native Loader skill rendering snapshot')
    const previousFiber = entry.fiber
    const invalidated = new Promise((resolve, reject) => {
      const abort = () => { off(); reject(t.signal.reason) }
      const off = ctx.on('skills/change', () => { off(); t.signal.removeEventListener('abort', abort); resolve() })
      t.signal.addEventListener('abort', abort, { once: true })
    })
    await ctx.loader.update('bridge', { config: { home, enabled: true, skills: false } })
    await invalidated
    assert.equal(entry.fiber, previousFiber, 'volatile edits must not remount the owner')
    assert.deepEqual(await ctx.skills.list(), [])
    assert.equal(await ctx.skills.get(list[0].name), undefined)
    const disabledCatalog = await ctx.tools.execute({ name: 'codex_home_catalog', callId: 'loader-catalog-disabled', arguments: {}, signal: t.signal })
    assert.equal(disabledCatalog.isError, false)
    assert.deepEqual(report(disabledCatalog), catalogSnapshot.skillsDisabled, 'reviewed whole-category retraction snapshot')
    assert.equal(JSON.stringify(disabledCatalog.content).includes(list[0].name), false, 'catalog must observe the same category revision')
    assert.equal(await readFile(skillFile, 'utf8'), content)
    ctx.loader.remove('tools')
    await ctx.loader.await()
    assert.equal(ctx.tools, undefined)
    await ctx.loader.root.update(config.map(row => row.id === 'bridge' ? { ...row, config: { home, enabled: true, skills: false } } : row))
    await ctx.loader.await()
    assert.equal(ctx.loader.resolve('bridge').fiber, previousFiber, 'optional service reload must not remount bridge')
    assert.ok(ctx.tools.get('codex_home_catalog'), 'catalog contribution must recover when tools returns')
    assert.equal(ctx.tools.get('codex_agent'), undefined)
    const recovered = await ctx.tools.execute({ name: 'codex_home_catalog', callId: 'loader-catalog-recovered', arguments: {}, signal: t.signal })
    assert.equal(recovered.isError, false)
    assert.deepEqual(report(recovered), catalogSnapshot.skillsDisabled)
    ctx.loader.remove('bridge')
    await ctx.loader.await()
    assert.deepEqual(await ctx.skills.list(), [])
    assert.equal(ctx.tools.get('codex_home_catalog'), undefined)
    assert.equal(ctx.tools.get('codex_agent'), undefined)
  } finally {
    ctx.loader.root.stop()
    await ctx.loader.await()
    await fiber.dispose()
    assert.ok(root.startsWith(join(tmpdir(), 'codex-loader-test-')))
    await rm(root, { recursive: true, force: true })
  }
})
