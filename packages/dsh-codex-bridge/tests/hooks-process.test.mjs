import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import LocalBashExecutor from '@deepseek-ai/dsh-bash-local'
import { HookBridge } from '../lib/hooks.js'

const quote = value => `'${value.replaceAll("'", "'\\''")}'`
async function until(predicate) {
  const deadline = Date.now() + 5000
  do { if (await predicate()) return; await delay(20) } while (Date.now() < deadline)
  assert.fail('fixture process did not reach the expected state within five seconds')
}
function alive(pid) { try { process.kill(pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error } }

// Actual published providers, not a replacement shell. This is a process-level composition,
// not product Loader/Web E2E and does not read the real user's Codex Home.
test('real rc.2 shell cancels a hook and its child on aggregate revocation', { timeout: 15000, skip: process.platform === 'win32' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-codex-hook-process-'))
  assert.ok(directory.startsWith(join(tmpdir(), 'dsh-codex-hook-process-')))
  const script = join(directory, 'fixture.mjs'), marker = join(directory, 'pids.json')
  await writeFile(script, `import {spawn} from 'node:child_process'; import {writeFileSync} from 'node:fs'; const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); writeFileSync(process.argv[2],JSON.stringify([process.pid,child.pid])); setInterval(()=>{},1000);`)
  const ctx = new Context()
  const subprocess = ctx.plugin(LocalSubprocessRuntime)
  const shell = ctx.plugin(LocalBashExecutor, { graceMs: 100, maxTimeoutMs: 10000 })
  let bridge, pids = []
  t.after(async () => {
    await bridge?.close()
    await shell.dispose()
    await subprocess.dispose()
    // Delete only this exact asserted mkdtemp directory.
    await rm(directory, { recursive: true, force: true })
  })
  await subprocess; await shell
  let granted = true
  const runtime = { options: () => ({ enabled: true, executeHooks: granted, plugins: true }), catalog: async () => ({ hooks: [{ event: 'PreToolUse', source: script, root: directory, handler: { type: 'command', command: `${quote(process.execPath)} ${quote(script)} ${quote(marker)}` } }] }) }
  bridge = new HookBridge(ctx, runtime, 10000)
  const pending = bridge.run('PreToolUse', 'fixture', { hook_event_name: 'PreToolUse' }, {})
  await until(async () => { try { pids = JSON.parse(await readFile(marker, 'utf8')); return pids.length === 2 } catch (error) { if (error.code === 'ENOENT') return false; throw error } })
  assert.ok(pids.every(alive))
  granted = false
  bridge.reconcile()
  const result = await pending
  assert.deepEqual(result.additionalContext, [])
  await until(() => pids.every(pid => !alive(pid)))
})
