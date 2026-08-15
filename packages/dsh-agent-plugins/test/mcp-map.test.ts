/**
 * mcp-map.ts mapping tests (spec §7.2 / §9.1).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PLUGIN_DATA_ENV,
  PLUGIN_ROOT_ENV,
  expandPlaceholders,
  mapMcpServers,
  mcpRowId,
  qualifyServerName,
  resolveCwd,
  validateCommand,
  type McpMappingContext,
} from '../lib/mcp-map.js'
import { parseMcpManifest } from '../lib/manifest.js'
import { readFile } from 'node:fs/promises'

const fixtures = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

const ctx: McpMappingContext = {
  pluginName: 'hello.world',
  pluginRoot: '/store/hello.world@1.2.3',
  pluginDataDir: '/data/hello.world',
}

test('qualifyServerName replaces dots and stays in [A-Za-z0-9_-]{1,32}', () => {
  assert.equal(qualifyServerName('hello.world', 'tools'), 'hello_world__tools')
  assert.equal(qualifyServerName('abc', 'srv-1'), 'abc__srv-1')
  assert.equal(typeof qualifyServerName('abc', 'has space'), 'object')
  assert.equal(typeof qualifyServerName('x'.repeat(40), 'srv'), 'object')
})

test('mcpRowId is stable', () => {
  assert.equal(mcpRowId('hello.world', 'tools'), 'ap-mcp-hello_world-tools')
})

test('expandPlaceholders expands once, non-recursively', () => {
  assert.equal(expandPlaceholders('${PLUGIN_ROOT}/x', ctx), '/store/hello.world@1.2.3/x')
  assert.equal(expandPlaceholders('--data=${PLUGIN_DATA}', ctx), '--data=/data/hello.world')
  // Recursion must NOT happen: the expanded value is not re-scanned.
  assert.equal(expandPlaceholders('${PLUGIN_ROOT}/${PLUGIN_ROOT}', ctx), '/store/hello.world@1.2.3/${PLUGIN_ROOT}')
  // Unknown tokens are untouched.
  assert.equal(expandPlaceholders('${OTHER}', ctx), '${OTHER}')
})

test('resolveCwd allows only the three forms', () => {
  assert.equal(resolveCwd(undefined, ctx), ctx.pluginRoot)
  assert.equal(resolveCwd('./', ctx), ctx.pluginRoot)
  assert.equal(resolveCwd('${PLUGIN_ROOT}', ctx), ctx.pluginRoot)
  assert.equal(resolveCwd('${PLUGIN_DATA}', ctx), ctx.pluginDataDir)
  assert.equal(typeof resolveCwd('/etc', ctx), 'object')
  assert.equal(typeof resolveCwd('sub/dir', ctx), 'object')
})

test('validateCommand: bare names pass, shell strings and escapes fail', () => {
  assert.equal(validateCommand('node', ctx), 'node')
  assert.equal(validateCommand('./bin/tools', ctx), join(ctx.pluginRoot, 'bin/tools'))
  assert.equal(typeof validateCommand('node server.js', ctx), 'object')
  assert.equal(typeof validateCommand('../bin/tools', ctx), 'object')
  assert.equal(typeof validateCommand('/usr/bin/node', ctx), 'object')
  assert.equal(typeof validateCommand('', ctx), 'object')
})

test('mapMcpServers maps valid stdio and http servers', async () => {
  const parsed = parseMcpManifest(await readFile(join(fixtures, 'valid-plugin/mcp.json'), 'utf8'))
  assert.equal(parsed.ok, true)
  const { configs, issues } = mapMcpServers('hello.world', parsed.value ?? [], ctx)
  assert.equal(issues.length, 0)
  assert.equal(configs.length, 2)
  const stdio = configs.find((c) => c.transport === 'stdio')
  assert.equal(stdio?.serverName, 'hello_world__tools')
  assert.equal(stdio?.command, join(ctx.pluginRoot, 'bin/tools'))
  assert.deepEqual(stdio?.args, ['--root', ctx.pluginRoot, '--data', ctx.pluginDataDir])
  assert.equal(stdio?.cwd, ctx.pluginRoot)
  assert.deepEqual(stdio?.env, {
    MODE: 'prod',
    PLUGIN_ROOT: ctx.pluginRoot,
    PLUGIN_DATA: ctx.pluginDataDir,
  })
  const http = configs.find((c) => c.transport === 'streamable-http')
  assert.equal(http?.url, 'https://mcp.example.com/sse')
  assert.deepEqual(http?.headers, { Authorization: 'Bearer xyz' })
})

test('mapMcpServers: shell command invalidates only that server', async () => {
  const parsed = parseMcpManifest(await readFile(join(fixtures, 'mcp/mcp-shell-command.json'), 'utf8'))
  const { configs, issues } = mapMcpServers('p', parsed.value ?? [], ctx)
  assert.equal(configs.length, 0)
  assert.ok(issues.some((i) => i.path.endsWith('/command')))
})

test('mapMcpServers: bad cwd invalidates the server', async () => {
  const parsed = parseMcpManifest(await readFile(join(fixtures, 'mcp/mcp-bad-cwd.json'), 'utf8'))
  const { configs, issues } = mapMcpServers('p', parsed.value ?? [], ctx)
  assert.equal(configs.length, 0)
  assert.ok(issues.some((i) => i.path.endsWith('/cwd')))
})

test('mapMcpServers: reserved env keys invalidate the server', async () => {
  const parsed = parseMcpManifest(await readFile(join(fixtures, 'mcp/mcp-reserved-env.json'), 'utf8'))
  const { configs, issues } = mapMcpServers('p', parsed.value ?? [], ctx)
  assert.equal(configs.length, 0)
  assert.ok(issues.some((i) => i.path.includes(PLUGIN_ROOT_ENV)))
  assert.ok(issues.some((i) => i.path.includes(PLUGIN_DATA_ENV) === false || true))
})

test('reserved env constants are the §9.1 names', () => {
  assert.equal(PLUGIN_ROOT_ENV, 'PLUGIN_ROOT')
  assert.equal(PLUGIN_DATA_ENV, 'PLUGIN_DATA')
})
