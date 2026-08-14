/**
 * manifest.ts validation tests — spec §5 / §7.2.1 compliance fixtures.
 * Runs against the compiled lib (pnpm build first).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MCP_SCHEMA_URL,
  PLUGIN_SCHEMA_URL,
  isValidPluginName,
  isValidServerUrl,
  parseMcpManifest,
  parsePluginManifest,
} from '../lib/manifest.js'

const fixtures = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

const read = (p: string) => readFile(join(fixtures, p), 'utf8')

test('valid plugin.json passes and projects fields', async () => {
  const result = parsePluginManifest(await read('valid-plugin/plugin.json'))
  assert.equal(result.ok, true)
  assert.equal(result.value?.name, 'hello-world')
  assert.equal(result.value?.version, '1.2.3')
  assert.equal(result.value?.description, 'A valid test plugin')
  assert.equal(result.issues.length, 0)
})

test('$schema mismatch rejects the whole plugin', async () => {
  const result = parsePluginManifest(await read('bad-schema/plugin.json'))
  assert.equal(result.ok, false)
  assert.equal(result.value, undefined)
  assert.ok(result.issues.some((i) => i.fatal === true && i.path === 'plugin.json#/$schema'))
})

test('missing name rejects the plugin', async () => {
  const result = parsePluginManifest(await read('no-name/plugin.json'))
  assert.equal(result.ok, false)
})

test('name format violation (..) rejects the plugin', async () => {
  const result = parsePluginManifest(await read('bad-name/plugin.json'))
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((i) => i.path === 'plugin.json#/name'))
})

test('unknown top-level field is reported but does not reject', async () => {
  const result = parsePluginManifest(await read('unknown-field/plugin.json'))
  assert.equal(result.ok, true)
  assert.ok(result.issues.some((i) => i.path === 'plugin.json#/mysteryField'))
})

test('non-object extensions is ignored and reported', async () => {
  const result = parsePluginManifest(await read('bad-extensions/plugin.json'))
  assert.equal(result.ok, true)
  assert.ok(result.issues.some((i) => i.path === 'plugin.json#/extensions'))
})

test('invalid JSON rejects', () => {
  const result = parsePluginManifest('{ not json')
  assert.equal(result.ok, false)
})

test('isValidPluginName enforces the §5.5 format', () => {
  assert.equal(isValidPluginName('hello'), true)
  assert.equal(isValidPluginName('hello.world-2'), true)
  assert.equal(isValidPluginName('a'), true)
  assert.equal(isValidPluginName('Hello'), false)
  assert.equal(isValidPluginName('a--b'), false)
  assert.equal(isValidPluginName('a..b'), false)
  assert.equal(isValidPluginName('-a'), false)
  assert.equal(isValidPluginName('a-'), false)
  assert.equal(isValidPluginName('a'.repeat(65)), false)
  assert.equal(isValidPluginName(''), false)
  assert.equal(isValidPluginName(42), false)
})

test('mcp.json: valid plugin fixture parses both servers', async () => {
  const result = parseMcpManifest(await read('valid-plugin/mcp.json'))
  assert.equal(result.ok, true)
  assert.equal(result.value?.length, 2)
  const stdio = result.value?.find((s) => s.type === 'stdio')
  assert.equal(stdio?.command, './bin/tools')
  assert.deepEqual(stdio?.args, ['--root', '${PLUGIN_ROOT}', '--data', '${PLUGIN_DATA}'])
  const http = result.value?.find((s) => s.type === 'streamable-http')
  assert.equal(http?.url, 'https://mcp.example.com/sse')
})

test('mcp.json: empty mcpServers is legal', async () => {
  const result = parseMcpManifest(await read('mcp/mcp-empty.json'))
  assert.equal(result.ok, true)
  assert.deepEqual(result.value, [])
})

test('mcp.json: extra top-level field disables the whole MCP half', async () => {
  const result = parseMcpManifest(await read('mcp/mcp-extra-field.json'))
  assert.equal(result.ok, false)
})

test('mcp.json: $schema version must match', async () => {
  const result = parseMcpManifest(await read('mcp/mcp-bad-schema.json'))
  assert.equal(result.ok, false)
})

test('mcp.json: non-loopback http url is invalid', async () => {
  const result = parseMcpManifest(await read('mcp/mcp-http-not-https.json'))
  assert.equal(result.ok, true)
  assert.ok(result.issues.some((i) => i.path === 'mcp.json#/mcpServers/s/url'))
  assert.equal(result.value?.length, 0)
})

test('mcp.json: duplicate header casing invalidates the server', async () => {
  const result = parseMcpManifest(await read('mcp/mcp-dup-header.json'))
  assert.equal(result.ok, true)
  assert.ok(result.issues.some((i) => i.path === 'mcp.json#/mcpServers/s/headers'))
})

test('mcp.json: sse is skipped with a warning, other servers survive', async () => {
  const result = parseMcpManifest(await read('mcp/mcp-sse.json'))
  assert.equal(result.ok, true)
  assert.deepEqual(result.value, [])
  assert.ok(result.issues.some((i) => i.message.includes('unsupported')))
})

test('mcp.json: unknown type invalidates only that server', async () => {
  const result = parseMcpManifest(await read('mcp/mcp-unknown-type.json'))
  assert.equal(result.ok, true)
  assert.deepEqual(result.value, [])
  assert.ok(result.issues.some((i) => i.path === 'mcp.json#/mcpServers/s/type'))
})

test('isValidServerUrl enforces §7.2.1 URL rules', () => {
  assert.deepEqual(isValidServerUrl('https://m.example.com/sse'), { ok: true })
  assert.deepEqual(isValidServerUrl('http://127.0.0.1:8080/mcp'), { ok: true })
  assert.deepEqual(isValidServerUrl('http://localhost:8080/mcp'), { ok: true })
  assert.equal(isValidServerUrl('http://example.com/mcp').ok, false)
  assert.equal(isValidServerUrl('ftp://example.com/mcp').ok, false)
  assert.equal(isValidServerUrl('https://user:pass@example.com/mcp').ok, false)
  assert.equal(isValidServerUrl('https://example.com/mcp#frag').ok, false)
  assert.equal(isValidServerUrl('not a url').ok, false)
})

test('schema URLs match the spec constants', () => {
  assert.equal(PLUGIN_SCHEMA_URL, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
  assert.equal(MCP_SCHEMA_URL, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json')
})
