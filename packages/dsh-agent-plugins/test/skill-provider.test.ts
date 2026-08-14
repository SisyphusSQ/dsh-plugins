/**
 * AgentPluginsSkillProvider tests: discovery, component-level filtering,
 * name conflicts, project stores, get() loading.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { AgentPluginsSkillProvider, AGENT_PLUGINS_SKILL_RANK, AGENT_PLUGINS_SOURCE } from '../lib/skill-provider.js'
import { EMPTY_LEDGER, installFromSource, setPluginEnabled, setSkillEnabled, type Ledger } from '../lib/store.js'

const fixtures = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

function fakeCtx(): Context {
  return {} as unknown as Context
}

async function makeStore(): Promise<{ storeDir: string; dataRoot: string }> {
  const base = await mkdtemp(join(tmpdir(), 'ap-skills-'))
  const storeDir = join(base, 'store')
  const dataRoot = join(base, 'data')
  await mkdir(storeDir, { recursive: true })
  await mkdir(dataRoot, { recursive: true })
  return { storeDir, dataRoot }
}

function makeProvider(storeDir: string, ledger: Ledger, warns: string[] = []): AgentPluginsSkillProvider {
  return new AgentPluginsSkillProvider(fakeCtx(), {
    stores: [storeDir],
    readLedger: () => ledger,
    warn: (m) => warns.push(m),
  })
}

test('list() discovers skills from installed plugins', async () => {
  const { storeDir, dataRoot } = await makeStore()
  const ledger = structuredClone(EMPTY_LEDGER)
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)

  const provider = makeProvider(storeDir, ledger)
  const candidates = await provider.list({})
  assert.equal(candidates.length, 2)
  const names = candidates.map((c) => c.name).sort()
  assert.deepEqual(names, ['skill-a', 'skill-b'])
  const skillA = candidates.find((c) => c.name === 'skill-a')
  assert.equal(skillA?.description, 'Skill A for testing')
  assert.equal(skillA?.provider, 'agent-plugins')
  assert.equal(skillA?.source, AGENT_PLUGINS_SOURCE)
  assert.equal(skillA?.rank, AGENT_PLUGINS_SKILL_RANK)
  assert.deepEqual(skillA?.invocation, { modelInvocable: true, userInvocable: true })
  assert.ok((skillA?.locator as { path: string }).path.endsWith('skills/skill-a/SKILL.md'))
})

test('component-level disable removes only that skill', async () => {
  const { storeDir, dataRoot } = await makeStore()
  const ledger = structuredClone(EMPTY_LEDGER)
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)
  await setSkillEnabled(storeDir, ledger, 'hello-world', 'skill-a', false)

  const provider = makeProvider(storeDir, ledger)
  const candidates = await provider.list({})
  assert.deepEqual(candidates.map((c) => c.name).sort(), ['skill-b'])
})

test('plugin-level disable removes all skills of that plugin', async () => {
  const { storeDir, dataRoot } = await makeStore()
  const ledger = structuredClone(EMPTY_LEDGER)
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)
  await setPluginEnabled(storeDir, ledger, 'hello-world', false)

  const provider = makeProvider(storeDir, ledger)
  const candidates = await provider.list({})
  assert.equal(candidates.length, 0)
})

test('duplicate skill names: first store order wins, later ones warn', async () => {
  const { storeDir, dataRoot } = await makeStore()
  const ledger = structuredClone(EMPTY_LEDGER)
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)

  // Build a second plugin that ships a skill also named skill-a.
  const secondDir = join(storeDir, '.staging-second')
  await mkdir(join(secondDir, 'skills', 'skill-a'), { recursive: true })
  await writeFile(join(secondDir, 'plugin.json'), JSON.stringify({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'second-plugin',
  }))
  await writeFile(join(secondDir, 'skills', 'skill-a', 'SKILL.md'), '---\nname: skill-a\ndescription: second copy\n---\nbody')
  const second = await installFromSource({ kind: 'dir', path: secondDir, checksum: '' }, { storeDir, dataRoot }, ledger)
  assert.equal(second.name, 'second-plugin')
  await rm(secondDir, { recursive: true, force: true })

  const warns: string[] = []
  const provider = makeProvider(storeDir, ledger, warns)
  const candidates = await provider.list({})
  const skillA = candidates.filter((c) => c.name === 'skill-a')
  assert.equal(skillA.length, 1)
  assert.equal(skillA[0]?.description, 'Skill A for testing')
  assert.ok(warns.some((w) => w.includes('skill-a') && w.includes('conflicts')))
})

test('project-level store contributes skills for a cwd', async () => {
  const { storeDir, dataRoot } = await makeStore()
  const ledger = structuredClone(EMPTY_LEDGER)
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)

  const project = await mkdtemp(join(tmpdir(), 'ap-project-'))
  const projectStore = join(project, '.agent-plugins')
  const projectLedger = structuredClone(EMPTY_LEDGER)
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir: projectStore, dataRoot: join(project, 'data') }, projectLedger)

  const warns: string[] = []
  const provider = new AgentPluginsSkillProvider(fakeCtx(), {
    stores: [storeDir],
    readLedger: () => {
      // Both ledgers merged: machine store + project store rows.
      const merged: Ledger = { version: 1, plugins: { ...ledger.plugins, ...projectLedger.plugins } }
      return merged
    },
    warn: (m) => warns.push(m),
  })
  const candidates = await provider.list({ cwd: project })
  assert.equal(candidates.length, 2)
  // No project store → no extra candidates.
  const plain = await provider.list({ cwd: storeDir })
  assert.equal(plain.length, 2)
})

test('get() loads the full skill definition', async () => {
  const { storeDir, dataRoot } = await makeStore()
  const ledger = structuredClone(EMPTY_LEDGER)
  await installFromSource({ kind: 'dir', path: join(fixtures, 'valid-plugin'), checksum: '' }, { storeDir, dataRoot }, ledger)

  const provider = makeProvider(storeDir, ledger)
  const candidates = await provider.list({})
  const skillA = candidates.find((c) => c.name === 'skill-a')
  assert.ok(skillA !== undefined)
  const definition = await provider.get(skillA, {})
  assert.equal(definition?.name, 'skill-a')
  assert.equal(definition?.provider, 'agent-plugins')
  assert.equal(definition?.content, 'Body A')
  assert.equal(definition?.path, (skillA.locator as { path: string }).path)
})
