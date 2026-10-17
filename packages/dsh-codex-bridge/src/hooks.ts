import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-session-projection'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { appendHookInvoked, appendHookResult, matcherDiagnostic, matchesMatcher, mergeHookOutputs, runHook } from '@deepseek-ai/dsh-hook-protocol'
import type { CommandHook, HookOutput, RunHookResult } from '@deepseek-ai/dsh-hook-protocol'
import { digest } from './parse.js'
import type { HomeHook } from './types.js'
import type { HomeRuntime } from './runtime.js'

const events = new Set(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'])
export interface CompiledHook { command: CommandHook; matcher?: string; root: string; identity: string }
/** Compile only the synchronous command subset; unsupported execution fields fail closed.
 * @param row Private Home hook metadata.
 * @returns A validated command or a safe error with no source command.
 */
export function compileHook(row: HomeHook): CompiledHook {
  if (!events.has(row.event)) throw new Error('Unsupported hook event')
  const h = row.handler
  if ((h.type !== undefined && h.type !== 'command') || (h.async !== undefined && h.async !== false)) throw new Error('Only synchronous command hooks are supported')
  if (Object.keys(h).some(key => !['type', 'command', 'timeout', 'timeoutSec', 'async'].includes(key))) throw new Error('Unsupported hook execution field')
  if (typeof h.command !== 'string' || !h.command.trim()) throw new Error('Missing hook command')
  // Do not silently substitute shell syntax or claim equivalence for unsupported placeholders.
  if (/\$\{(?:CODEX|CLAUDE)_PLUGIN_ROOT\}|\$\{?CLAUDE_PROJECT_DIR/.test(h.command)) throw new Error('Unsupported hook root interpolation')
  if (h.timeout !== undefined && h.timeoutSec !== undefined) throw new Error('Ambiguous hook timeout')
  const timeout = h.timeout ?? h.timeoutSec
  if (timeout !== undefined && (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0 || timeout > 86400)) throw new Error('Invalid hook timeout')
  const matcher = ['UserPromptSubmit', 'Stop'].includes(row.event) ? undefined : row.matcher
  if (matcherDiagnostic(matcher, 'codex') !== undefined) throw new Error('Invalid hook matcher')
  return { command: { command: h.command, ...(typeof timeout === 'number' ? { timeoutSec: timeout } : {}) }, ...(matcher !== undefined ? { matcher } : {}), root: row.root, identity: digest(JSON.stringify(row)) }
}

interface Invocation { agent?: Agent | undefined; turn?: number; signal?: AbortSignal | undefined }
type Runner = typeof runHook
/** Owned hook runs. Catalog inspection never starts commands; each event checks the current aggregate grant. */
export class HookBridge {
  private closed = false
  private active = new Set<{ controller: AbortController; done: Promise<unknown>; revision: string }>()
  constructor(private ctx: Context, private runtime: HomeRuntime, private timeoutMs: number, private runner: Runner = runHook) {}
  private granted(): boolean { const o = this.runtime.options(); return !this.closed && o.enabled && o.executeHooks }
  /** Abort every in-flight command after grant/category edits; shell cancellation owns process-group cleanup. */
  reconcile(): void {
    for (const run of this.active) if (!this.granted() || run.revision !== JSON.stringify(this.runtime.options())) run.controller.abort()
  }
  /** Execute matching commands, retaining only outcomes from the same authorization revision.
   * @param point Supported Codex event name.
   * @param subject Matcher subject (tool name or session source).
   * @param payload Trusted stdin event payload.
   * @param invocation Owning Agent/turn/signal.
   * @returns Folded hook outcomes; revoked results are never injected.
   */
  async run(point: string, subject: string, payload: unknown, invocation: Invocation) {
    const outputs: HookOutput[] = []
    if (!this.granted()) return mergeHookOutputs(outputs)
    const revision = JSON.stringify(this.runtime.options())
    const catalog = await this.runtime.catalog(invocation.signal)
    if (!this.granted() || revision !== JSON.stringify(this.runtime.options())) return mergeHookOutputs(outputs)
    for (const row of catalog.hooks) {
      if (row.event !== point) continue
      if (row.pluginId && !this.runtime.options().plugins) continue
      let hook: CompiledHook
      try { hook = compileHook(row) } catch { this.ctx.logger.warn('codex-home: unsupported hook configuration was not executed'); continue }
      if (!matchesMatcher(hook.matcher, subject, 'codex')) continue
      if (!this.granted() || revision !== JSON.stringify(this.runtime.options())) break
      const controller = new AbortController()
      const signal = invocation.signal ? AbortSignal.any([invocation.signal, controller.signal]) : controller.signal
      const handlerId = `suqingsq-codex:${hook.identity}`
      const session = invocation.agent?.session
      if (session && invocation.turn !== undefined) appendHookInvoked(session, { turn: invocation.turn, point, dialect: 'codex', handlerId })
      const done: Promise<RunHookResult> = this.runner(this.ctx.shell, hook.command, { payload, signal, cwd: invocation.agent?.session.header.cwd ?? hook.root, trailingNewline: false, expectedEventName: point, defaultTimeoutMs: this.timeoutMs }, () => performance.now())
      const owned = { controller, done, revision }
      this.active.add(owned)
      let outcome: RunHookResult
      try { outcome = await done } finally { this.active.delete(owned) }
      // Keep the outcome log bounded and do not persist command stderr (may contain program secrets).
      if (session && invocation.turn !== undefined) appendHookResult(session, { turn: invocation.turn, point, handlerId, output: { ...outcome.output, stderr: '' }, stderrSummaryMaxChars: 1, durationMs: outcome.durationMs })
      if (signal.aborted || !this.granted() || revision !== JSON.stringify(this.runtime.options())) continue
      const output = outcome.output
      if (output.continue === false && point !== 'Stop') {
        output.decision = 'deny'
        output.reason = output.stopReason ?? 'Stopped by Codex Home hook'
      }
      if (output.updatedInput !== undefined || output.decision === 'ask') {
        this.ctx.logger.warn('codex-home: unsupported hook rewrite or approval request was blocked')
        outputs.push({ exitCode: 2, stderr: '', stdout: '', decision: 'deny', reason: 'Hook requires an unsupported rewrite or approval policy' })
        continue
      }
      if (output.systemMessage !== undefined) this.ctx.logger.warn('codex-home: hook notification is unsupported')
      if (['SessionStart', 'UserPromptSubmit'].includes(point) && output.exitCode === 0 && output.additionalContext === undefined && output.stdout && !output.stdout.startsWith('{')) output.additionalContext = output.stdout
      outputs.push(output)
    }
    // A later command may have been revoked after an earlier one produced context.
    return mergeHookOutputs(this.granted() && revision === JSON.stringify(this.runtime.options()) ? outputs : [])
  }
  /** Abort and drain this plugin's commands on unload. */
  async close(): Promise<void> { this.closed = true; for (const run of this.active) run.controller.abort(); await Promise.allSettled([...this.active].map(run => run.done)) }
}

declare module '@deepseek-ai/dsh-llm' { interface MessageSourceMap { 'suqingsq-codex-hook': { kind: 'suqingsq-codex-hook' } } }
const context = (texts: string[]) => texts.length ? createUserMessage({ content: texts.map(text => ({ type: 'text', text })), source: { kind: 'suqingsq-codex-hook' } }) : undefined
/** Mount hook events through the target host's public interception seams. */
export function registerHooks(ctx: Context, bridge: HookBridge): void {
  const lastTurn = (agent?: Agent) => agent ? ctx.sessionProjections.stateOf(agent.session, 'turnBoundary')?.lastTurn ?? 0 : 0
  const base = (agent: Agent | undefined, point: string) => ({ session_id: agent?.session.header.id ?? '', transcript_path: null, cwd: agent?.session.header.cwd ?? process.cwd(), hook_event_name: point, permission_mode: 'default', model: '' })
  ctx.on('agent/created', async ({ agent, source, signal }) => {
    const result = await bridge.run('SessionStart', source, { ...base(agent, 'SessionStart'), source }, { agent, signal })
    if (result.decision === 'deny' || result.stop) {
      ctx.logger.warn('codex-home: SessionStart blocking cannot prevent Agent creation; no hook context was injected')
      return
    }
    const message = context(result.additionalContext)
    if (message) agent.inject(message)
  })
  ctx.on('agent/pre-step', async ({ agent, messages, turn, signal }, next) => {
    if (!messages.length) return next()
    const result = await bridge.run('UserPromptSubmit', '', { ...base(agent, 'UserPromptSubmit'), turn_id: String(turn), prompt: messages.flatMap(m => m.content).filter(b => b.type === 'text').map(b => b.text).join('') }, { agent, turn, signal })
    if (result.decision === 'deny') return { kind: 'reject' }
    const downstream = await next(), message = context(result.additionalContext)
    return message && downstream.kind === 'enter' ? { ...downstream, messages: [...downstream.messages, message] } : downstream
  })
  ctx.on('tools/pre-execute', async (exec, next) => {
    const turn = lastTurn(exec.agent)
    const result = await bridge.run('PreToolUse', exec.name, { ...base(exec.agent, 'PreToolUse'), turn_id: String(turn), tool_name: exec.name, tool_input: exec.arguments, tool_use_id: exec.callId }, { agent: exec.agent, turn, signal: exec.signal })
    return result.decision === 'deny' ? { kind: 'deny', reason: result.reason ?? 'Blocked by Codex Home hook' } : next()
  })
  ctx.on('tools/post-execute', async (exec, output, next) => {
    const turn = lastTurn(exec.agent)
    const result = await bridge.run('PostToolUse', exec.name, { ...base(exec.agent, 'PostToolUse'), turn_id: String(turn), tool_name: exec.name, tool_input: exec.arguments, tool_use_id: exec.callId, tool_response: output.content.filter(b => b.type === 'text').map(b => b.text).join('') }, { agent: exec.agent, turn, signal: exec.signal })
    const message = context(result.additionalContext)
    if (result.decision === 'deny') return { kind: 'block', feedback: [{ type: 'text', text: result.reason ?? 'Blocked by Codex Home hook' }], ...(message ? { additionalContexts: [message] } : {}) }
    const downstream = await next()
    return message ? { ...downstream, additionalContexts: [message, ...downstream.additionalContexts ?? []] } : downstream
  })
  const stopped = new WeakMap<Agent, number>()
  ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
    // One Stop invocation per turn prevents an imported hook from creating an unbounded stop loop.
    if (stopped.get(agent) === turn) return
    stopped.set(agent, turn)
    const result = await bridge.run('Stop', '', { ...base(agent, 'Stop'), turn_id: String(turn), stop_hook_active: false, last_assistant_message: null }, { agent, turn, signal })
    if (result.decision === 'deny' && !result.stop) agent.steer(context([result.reason ?? 'Continue: blocked by Codex Home Stop hook'])!)
  })
}
