import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogFingerprint, HomeRuntime } from '../lib/runtime.js'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const options = { home: '/fixture', enabled: true, instructions: true, skills: true, plugins: true, agents: true, connectMcp: false, executeHooks: false, maxFileBytes: 1000, maxEntries: 100, maxDepth: 4 }
const catalog = {
  home: '/fixture', scannedAt: 'first', instructions: { path: '/fixture/AGENTS.md', content: 'instructions', digest: 'digest' },
  skills: [], plugins: [], diagnostics: [],
  agents: [{ name: 'reviewer', path: '/fixture/agents/reviewer.toml', description: 'review', developerInstructions: 'original prompt', config: { model: 'first' } }],
  mcp: [{ id: 'server', name: 'server', source: 'config', root: '/fixture', enabled: true, config: { command: 'original-command' } }],
  hooks: [{ event: 'Stop', source: 'config', root: '/fixture', handler: { type: 'command', command: 'original-hook' } }],
}

test('catalog change token tracks role and executable configuration without returning content', () => {
  const before = catalogFingerprint(catalog, options)
  for (const change of [
    c => { c.agents[0].developerInstructions = 'updated prompt' },
    c => { c.agents[0].config.model = 'second' },
    c => { c.mcp[0].config.command = 'updated-command' },
    c => { c.mcp[0].enabled = false },
    c => { c.hooks[0].handler.command = 'updated-hook' },
    c => { c.hooks[0].matcher = 'tool-name' },
  ]) {
    const updated = structuredClone(catalog)
    change(updated)
    assert.notEqual(catalogFingerprint(updated, options), before)
  }
  assert.match(before, /^[a-f0-9]+$/)
  assert.equal(catalogFingerprint({ ...catalog, scannedAt: 'later', diagnostics: [{ code: 'warning' }] }, options), before)
  assert.notEqual(catalogFingerprint(catalog, { ...options, agents: false }), before)
})

test('runtime unload drains concurrent old scans and body reads; borrower abort stays local', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-runtime-test-'))
  let runtime
  try {
    const home = join(root, 'home')
    await mkdir(join(home, 'skills', 'fixture'), { recursive: true })
    const file = join(home, 'skills', 'fixture', 'SKILL.md')
    const source = '---\nname: fixture\ndescription: Read-only fixture\n---\nFixture body.\n'
    await writeFile(file, source)
    let current = { ...options, home, maxFileBytes: 4096 }
    runtime = new HomeRuntime(() => current, 0)
    const borrower = new AbortController()
    const cancelled = runtime.catalog(borrower.signal)
    const cancelledResult = assert.rejects(cancelled, /borrower cancelled/)
    const shared = runtime.catalog()
    borrower.abort(new Error('borrower cancelled'))
    await cancelledResult
    const observed = await shared
    assert.equal(observed.skills.length, 1, 'one caller cancellation must not cancel shared discovery')
    let settled = 0
    const jobs = []
    const watch = promise => jobs.push(promise.then(
      () => { settled++; return 'fulfilled' },
      () => { settled++; return 'rejected' },
    ))
    watch(runtime.body(observed.skills[0]))
    for (let index = 0; index < 8; index++) {
      current = { ...current, maxEntries: 100 + index }
      watch(runtime.catalog())
    }
    const closing = runtime.close()
    assert.equal(runtime.close(), closing, 'concurrent unloads share one drain barrier')
    await closing
    assert.equal(settled, jobs.length, 'all superseded scans and body callers settle before unload returns')
    assert.ok((await Promise.all(jobs)).every(result => result === 'rejected'))
    await assert.rejects(runtime.catalog(), /disposed/)
    await assert.rejects(runtime.body(observed.skills[0]), /disposed/)
    assert.equal(await readFile(file, 'utf8'), source)
  } finally {
    await runtime?.close()
    assert.ok(root.startsWith(join(tmpdir(), 'codex-runtime-test-')))
    await rm(root, { recursive: true, force: true })
  }
})

test('cached skill bodies reject changed frontmatter and openai invocation policies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-skill-policy-test-'))
  let runtime
  try {
    const directory = join(root, 'skills', 'fixture')
    await mkdir(join(directory, 'agents'), { recursive: true })
    const file = join(directory, 'SKILL.md')
    const uiFile = join(directory, 'agents', 'openai.yaml')
    const source = '---\nname: fixture\ndescription: Read-only fixture\n---\nFixture body.\n'
    await writeFile(file, source)
    const ui = 'policy:\n  allow_implicit_invocation: true\n'
    await writeFile(uiFile, ui)
    runtime = new HomeRuntime(() => ({ ...options, home: root, maxFileBytes: 4096 }), 60000)
    const skill = (await runtime.catalog()).skills[0]
    assert.equal(skill.modelInvocable, true)
    assert.ok((await runtime.body(skill)).includes('Fixture body.'))
    for (const field of ['disable-model-invocation: true', 'user-invocable: false']) {
      const changed = source.replace('description: Read-only fixture', `description: Read-only fixture\n${field}`)
      await writeFile(file, changed)
      assert.equal(await runtime.body(skill), undefined, 'same identity cannot bypass changed frontmatter policy')
      assert.equal(await readFile(file, 'utf8'), changed, 'bridge must not restore old policy bytes')
    }
    await writeFile(file, source)
    const restricted = 'policy:\n  allow_implicit_invocation: false\n'
    await writeFile(uiFile, restricted)
    assert.equal(await runtime.body(skill), undefined, 'cached implicit invocation grant must not survive an openai.yaml edit')
    assert.equal(await readFile(uiFile, 'utf8'), restricted)
    await writeFile(uiFile, ui)
    assert.ok((await runtime.body(skill)).includes('Fixture body.'))
    await writeFile(uiFile, 'policy: [invalid yaml')
    await assert.rejects(runtime.body(skill), /Invalid YAML/)
  } finally {
    await runtime?.close()
    assert.ok(root.startsWith(join(tmpdir(), 'codex-skill-policy-test-')))
    await rm(root, { recursive: true, force: true })
  }
})
