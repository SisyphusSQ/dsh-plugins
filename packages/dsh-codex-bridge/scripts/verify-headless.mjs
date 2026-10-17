// Opt-in packaged-artifact process probe. Uses only an explicitly supplied public runtime.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, realpath, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const [runtimeArg, artifactArg] = process.argv.slice(2)
assert(runtimeArg && artifactArg, 'Usage: node scripts/verify-headless.mjs <extracted-public-runtime-root> <tarball>')
const runtime = await realpath(resolve(runtimeArg))
const artifact = await realpath(resolve(artifactArg))
const modules = join(runtime, 'dsh/node_modules')
const cli = join(modules, '@deepseek-ai/dsh/lib/bin.js')
const manifest = JSON.parse(await readFile(join(modules, '@deepseek-ai/dsh/package.json'), 'utf8'))
assert.equal(manifest.version, '0.2.0-rc.2')
const root = await mkdtemp(join(tmpdir(), 'codex-headless-proof-'))
const home = join(root, 'home')
const dsh = join(home, '.dsh')
const codex = join(home, 'codex')
const profile = join(dsh, 'profiles/codex-bridge-test')
const packageDir = join(profile, 'node_modules/@suqingsq/dsh-codex-bridge')
await mkdir(packageDir, { recursive: true })
await mkdir(join(codex, 'agents'), { recursive: true })
await mkdir(join(codex, 'skills/process-skill'), { recursive: true })
const fixture = {
  'config.toml': '[agents.reviewer]\nconfig_file = "agents/reviewer.toml"\ndescription = "Process fixture role"\n',
  'AGENTS.md': 'PROCESS_HOME_INSTRUCTIONS: use the fixture tools.\n',
  'agents/reviewer.toml': 'developer_instructions = "PROCESS_ROLE_PERSONA"\nmodel = "role-model"\n',
  'skills/process-skill/SKILL.md': '---\nname: process-skill\ndescription: Read-only process fixture\n---\nFixture skill body.\n',
}
for (const [name, text] of Object.entries(fixture)) await writeFile(join(codex, name), text)
await writeFile(join(profile, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { '@suqingsq/dsh-codex-bridge': 'file:' + artifact }, dsh: { profile: { bundles: ['@suqingsq/dsh-codex-bridge'] } } }))
const tar = spawnSync('/usr/bin/tar', ['-xzf', artifact, '-C', packageDir, '--strip-components=1'], { encoding: 'utf8' })
assert.equal(tar.status, 0, tar.stderr)
await symlink(join(modules, '@deepseek-ai'), join(profile, 'node_modules/@deepseek-ai'))
await symlink(join(modules, 'yaml'), join(profile, 'node_modules/yaml'))
const toml = await realpath(new URL('../node_modules/smol-toml', import.meta.url))
await symlink(toml, join(profile, 'node_modules/smol-toml'))
const scripted = join(home, 'scripted.mjs')
await writeFile(scripted, `import assert from 'node:assert/strict'
import { LlmAdapter } from ${JSON.stringify(pathToFileURL(join(modules, '@deepseek-ai/dsh-llm/lib/index.js')).href)}
export const inject = ['llm']
export function apply(ctx) {
  let parentCalls = 0
  class Scripted extends LlmAdapter {
    async *stream(options) {
      assert.equal(options.provider, 'scripted')
      let text
      if (options.model === 'role-model') {
        assert.match(JSON.stringify(options.messages), /PROCESS_ROLE_PERSONA/)
        text = 'PROCESS_CHILD_OK'
      } else {
        assert.equal(options.model, 'parent-model')
        parentCalls++
        if (parentCalls <= 2) {
          assert.match(JSON.stringify(options.messages), /PROCESS_HOME_INSTRUCTIONS/)
          const name = parentCalls === 1 ? 'codex_home_catalog' : 'codex_agent'
          if (parentCalls === 2) assert.match(JSON.stringify(options.messages), /process-skill/)
          const args = parentCalls === 1 ? '{}' : JSON.stringify({ role: 'reviewer', prompt: 'Review fixture.' })
          const id = 'process-tool-' + parentCalls
          yield { type: 'block-start', index: 0, blockType: 'tool-call' }
          yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: args }
          yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: args } }
          yield { type: 'finish', reason: { kind: 'tool-calls' } }
          return
        }
        assert.equal(parentCalls, 3)
        assert.match(JSON.stringify(options.messages), /PROCESS_CHILD_OK/)
        text = 'PROCESS_PARENT_OK'
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['scripted'], new Scripted())
}
`)
const rows = [
  ['llm', 'dsh-llm'], ['session', 'dsh-session'], ['session-projection', 'dsh-session-projection'],
  ['system-prompt', 'dsh-system-prompt'], ['tools', 'dsh-tools'], ['agent', 'dsh-agent'],
  ['skills', 'dsh-skill'], ['loop', 'dsh-agent-loop'], ['subagent', 'dsh-subagent'],
  ['spawn', 'dsh-subagent-spawn-in-process'],
].map(([id, name]) => `    - id: ${id}\n      name: '@deepseek-ai/${name}'`).join('\n')
await writeFile(join(profile, 'cordis.patch.yml'), `- id: suqingsq-codex-bridge
  config:
    home: ${JSON.stringify(codex)}
    enabled: true
- insert:
${rows}
    - id: scripted
      name: ${JSON.stringify(scripted)}
    - id: default-model
      name: '@deepseek-ai/dsh-agent-default-model'
      config:
        provider: scripted
        model: parent-model
    - id: headless
      name: '@deepseek-ai/dsh-headless'
      config:
        task: 'Verify fixture catalog and native Codex role.'
        json: true
`)
const env = { HOME: home, DSH_HOME: dsh, CODEX_HOME: codex, PATH: '/usr/bin:/bin' }
const run = spawnSync(process.execPath, [cli, '--profile', 'codex-bridge-test'], { cwd: root, env, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 })
await writeFile(join(root, 'stdout.ndjson'), run.stdout ?? '')
await writeFile(join(root, 'stderr.log'), run.stderr ?? '')
assert.equal(run.error, undefined)
assert.equal(run.status, 0, run.stderr + run.stdout)
assert.equal(run.stderr.trim(), '', 'Unexpected startup warning or stderr')
const events = run.stdout.trim().split('\n').map(line => JSON.parse(line))
// Assert external process records, not only the model's final report.
const calls = events.filter(event => event.type === 'tool_call')
assert.deepEqual(calls.map(event => [event.tool, event.input]), [
  ['codex_home_catalog', {}], ['codex_agent', { role: 'reviewer', prompt: 'Review fixture.' }],
])
const results = events.filter(event => event.type === 'tool_result')
assert.deepEqual(results.map(event => event.status), ['completed', 'completed'])
const catalog = JSON.parse(results[0].result)
assert.equal(catalog.skills[0].originalName, 'process-skill')
assert.equal(catalog.agents[0].policyCompatible, true)
assert.deepEqual(JSON.parse(results[1].result), { output: [{ type: 'text', text: 'PROCESS_CHILD_OK' }], stopReason: 'completed' })
assert.deepEqual(events.find(event => event.phase === 'turn_end').reason, { kind: 'completed' })
assert.deepEqual(events.at(-1), { type: 'final', text: 'PROCESS_PARENT_OK' })
for (const [name, text] of Object.entries(fixture)) assert.equal(await readFile(join(codex, name), 'utf8'), text, 'Home fixture mutated: ' + name)
const report = { target: manifest.version, node: process.version, artifactSha256: createHash('sha256').update(await readFile(artifact)).digest('hex'), eventCount: events.length, fixtureUnchanged: true, root, boundaries: ['scripted LLM only', 'tarball materialized with linked dependencies, not package-manager installation', 'in-memory sessions; no durable backend', 'no Web browser or credentials'] }
await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
