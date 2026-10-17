import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanHome, catalogView } from '../lib/catalog.js'
import { HomeRuntime } from '../lib/runtime.js'
import { pluginManifest, componentPath, translateSkillCalls, mcpBlockedReason } from '../lib/parse.js'

const defaults = home => ({ home, enabled: true, instructions: true, skills: true, plugins: true, agents: true, connectMcp: false, executeHooks: false, maxFileBytes: 1048576, maxEntries: 1000, maxDepth: 8 })
async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-codex-bridge-test-'))
  // Cleanup only the exact mkdtemp directory owned by this test.
  assert.ok(home.startsWith(join(tmpdir(), 'dsh-codex-bridge-test-')))
  t.after(() => rm(home, { recursive: true, force: true }))
  const put = async (path, value) => { const absolute = join(home, path); await mkdir(join(absolute, '..'), { recursive: true }); await writeFile(absolute, value) }
  return { home, put }
}
const skill = (name, body = 'Use references/detail.md') => `---\nname: ${name}\ndescription: Example routing description\n---\n${body}\n`

test('disabled bridge does not attempt even an invalid Home path', async () => {
  const catalog = await scanHome({ ...defaults('/this-path-does-not-exist'), enabled: false })
  assert.equal(catalog.diagnostics.length, 0)
  assert.equal(catalog.skills.length, 0)
})
test('configured legacy roles obtain identity from Home config and can share a role file', async t => {
  const { home, put } = await fixture(t)
  await put('config.toml', '[agents.review]\nconfig_file = "agents/shared.toml"\ndescription = "Review implementation"\n[agents.audit]\nconfig_file = "agents/shared.toml"\ndescription = "Audit implementation"\n')
  await put('agents/shared.toml', 'model = "fixture-model"\ndeveloper_instructions = "Read carefully."\n')
  const catalog = await scanHome(defaults(home))
  assert.deepEqual(catalog.agents.map(agent => agent.name), ['review', 'audit'])
  assert.equal(catalog.agents[0].developerInstructions, 'Read carefully.')
  assert.deepEqual(catalog.agents[0].config, { model: 'fixture-model' })
  assert.equal((await scanHome({ ...defaults(home), agents: false })).agents.length, 0)
})
test('first nonempty AGENTS override wins and byte limit preserves UTF8', async t => {
  const { home, put } = await fixture(t)
  await put('config.toml', 'project_doc_max_bytes = 4\n')
  await put('AGENTS.override.md', '中文')
  await put('AGENTS.md', 'not selected')
  const catalog = await scanHome(defaults(home))
  assert.equal(catalog.instructions.content, '中')
  assert.ok(catalog.diagnostics.some(d => d.code === 'INSTRUCTIONS_TRUNCATED'))
})
test('zero instruction budget does not fall back to the default', async t => {
  const { home, put } = await fixture(t)
  await put('config.toml', 'project_doc_max_bytes = 0\n')
  await put('AGENTS.md', 'must not be injected')
  const catalog = await scanHome(defaults(home))
  assert.equal(catalog.instructions.content, '')
})
test('malformed config preserves independent read-only categories without enabling cached plugins', async t => {
  const { home, put } = await fixture(t)
  await put('config.toml', 'malformed = [')
  await put('AGENTS.md', 'independent instructions')
  await put('skills/plain/SKILL.md', skill('plain'))
  await put('plugins/cache/market/example/v1/plugin.json', '{"name":"example"}')
  const catalog = await scanHome(defaults(home))
  assert.equal(catalog.instructions.content, 'independent instructions')
  assert.deepEqual(catalog.skills.map(s => s.originalName), ['plain'])
  assert.equal(catalog.plugins[0].enabled, 'unknown')
  assert.ok(catalog.diagnostics.length > 0)
})
test('marketplace index revision cannot select a plugin cache revision', async t => {
  const { home, put } = await fixture(t)
  await put('config.toml', '[plugins."example@market"]\nenabled = true\n[marketplaces.market]\nlast_revision = "index-revision"\n')
  await put('plugins/cache/market/example/v1/plugin.json', '{"name":"example"}')
  let catalog = await scanHome(defaults(home))
  assert.equal(catalog.plugins[0].version, 'v1')
  await put('plugins/cache/market/example/index-revision/plugin.json', '{"name":"example"}')
  catalog = await scanHome(defaults(home))
  assert.equal(catalog.plugins[0].status, 'ambiguous')
})
test('Home and plugin Skills have independent whole-category switches', async t => {
  const { home, put } = await fixture(t)
  await put('config.toml', '[plugins."example@market"]\nenabled = true\n')
  await put('skills/plain/SKILL.md', skill('plain'))
  await put('plugins/cache/market/example/v1/.codex-plugin/plugin.json', JSON.stringify({ name: 'example' }))
  await put('plugins/cache/market/example/v1/skills/discuss/SKILL.md', skill('discuss_first'))
  await put('plugins/cache/market/example/v1/skills/discuss/agents/openai.yaml', 'policy:\n  allow_implicit_invocation: false\n')
  const standalone = await scanHome({ ...defaults(home), plugins: false })
  assert.deepEqual(standalone.skills.map(s => s.originalName), ['plain'])
  const pluginOnly = await scanHome({ ...defaults(home), skills: false })
  assert.deepEqual(pluginOnly.skills.map(s => s.originalName), ['example:discuss_first'])
  assert.equal(pluginOnly.skills[0].modelInvocable, false)
  assert.match(pluginOnly.skills[0].name, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
})
test('cache alone never proves enablement; multiple revisions never select newest', async t => {
  const { home, put } = await fixture(t)
  await put('plugins/cache/market/example/v1/plugin.json', '{"name":"example"}')
  await put('plugins/cache/market/example/v1/skills/a/SKILL.md', skill('a'))
  let catalog = await scanHome(defaults(home))
  assert.equal(catalog.plugins[0].status, 'unknown')
  assert.equal(catalog.skills.length, 0)
  await put('plugins/cache/market/example/v2/plugin.json', '{"name":"example"}')
  catalog = await scanHome(defaults(home))
  assert.equal(catalog.plugins[0].status, 'ambiguous')
})
test('symlink escapes and credential aliases are rejected without exposing contents', async t => {
  const { home, put } = await fixture(t)
  const external = await mkdtemp(join(tmpdir(), 'dsh-codex-bridge-external-'))
  assert.ok(external.startsWith(join(tmpdir(), 'dsh-codex-bridge-external-')))
  t.after(() => rm(external, { recursive: true, force: true }))
  await writeFile(join(external, 'SKILL.md'), skill('escape', 'private secret marker'))
  await mkdir(join(home, 'skills'), { recursive: true })
  await symlink(external, join(home, 'skills/escape'))
  await put('auth.json', skill('credential', 'credential secret marker'))
  await symlink(join(home, 'auth.json'), join(home, 'AGENTS.md'))
  const catalog = await scanHome(defaults(home))
  assert.equal(catalog.instructions, undefined)
  assert.equal(catalog.skills.length, 0)
  const serialized = JSON.stringify(catalogView(catalog))
  assert.ok(!serialized.includes('secret marker'))
  assert.ok(catalog.diagnostics.some(d => d.code === 'OUTSIDE_HOME'))
})
test('private execution config never crosses safe projection', async t => {
  const { home, put } = await fixture(t)
  await put('config.toml', '[mcp_servers.api]\nurl = "https://example.test/mcp"\n[mcp_servers.api.http_headers]\nAuthorization = "SECRET_TOKEN_MARKER"\n')
  const catalog = await scanHome({ ...defaults(home), connectMcp: true })
  assert.match(catalog.mcp[0].blockedReason, /independent DSH/, 'authentication must be configured independently in native DSH')
  assert.ok(!JSON.stringify(catalogView(catalog)).includes('SECRET_TOKEN_MARKER'))
})
test('runtime category change defeats previously cached skill loading', async t => {
  const { home, put } = await fixture(t)
  await put('skills/a/SKILL.md', skill('a'))
  let options = defaults(home)
  const runtime = new HomeRuntime(() => options, 60000)
  t.after(() => runtime.close())
  const current = (await runtime.catalog()).skills[0]
  assert.ok(await runtime.body(current))
  options = { ...options, skills: false }
  assert.equal(await runtime.body(current), undefined)
  assert.equal((await runtime.catalog()).skills.length, 0)
})
test('malformed config diagnostics omit parser excerpts', async t => {
  const { home, put } = await fixture(t)
  await put('config.toml', 'SECRET_PARSER_MARKER = [ broken')
  const catalog = await scanHome(defaults(home))
  assert.equal(catalog.diagnostics[0].code, 'INVALID_SOURCE')
  assert.ok(!JSON.stringify(catalog).includes('SECRET_PARSER_MARKER'))
})
test('canonical manifest drops compatibility overlay when OpenAI extension is present', () => {
  assert.deepEqual(pluginManifest({ name: 'canonical', extensions: { 'com.openai': {} } }, { name: 'legacy', hooks: './bad.json' }), { name: 'canonical' })
  assert.equal(pluginManifest({ name: 'canonical' }, { name: 'legacy', hooks: './ok.json' }).hooks, './ok.json')
  assert.throws(() => componentPath('/plugin', '../other'))
  assert.throws(() => componentPath('/plugin', './../../../outside'))
})
test('only explicit known namespaced skill tokens are translated', () => {
  assert.equal(translateSkillCalls('$personal-thin-skills:discuss_first and $unknown:a', new Map([['personal-thin-skills:discuss_first', 'codex-discuss']])), '$codex-discuss and $unknown:a')
  assert.ok(mcpBlockedReason({ command: 'server', env: { API_KEY: 'hidden' } }))
  assert.equal(mcpBlockedReason({ url: 'https://example.test/mcp' }), undefined)
})
