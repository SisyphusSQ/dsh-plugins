import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { HarnessError, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SubagentActivation } from '@deepseek-ai/dsh-subagent'
import { resolveChildAgentOptions, resolveChildDepth } from '@deepseek-ai/dsh-subagent'
import type { HomeAgent } from './types.js'
import type { HomeRuntime } from './runtime.js'

export interface CompiledRole { instructions: string; agentOptions?: AgentOptions }

/** Compile only equivalent public request fields; unsupported policies fail closed. */
export function compileRole(role: HomeAgent): CompiledRole {
  const unsupported = ['sandbox_mode', 'approval_policy', 'skills', 'mcp_servers'].filter(key => role.config[key] !== undefined)
  if (unsupported.length) throw new HarnessError(`Codex role has non-equivalent DSH policy fields: ${unsupported.join(', ')}. No child was started.`, 'CODEX_ROLE_UNSUPPORTED_POLICY')
  if (Object.keys(role.config).some(key => !['model', 'model_reasoning_effort'].includes(key))) throw new HarnessError('Codex role contains unsupported runtime configuration. No child was started.', 'CODEX_ROLE_UNSUPPORTED_CONFIG')
  // DSH 0.2.1 removed the opaque `persona` field from a subagent start request.
  // Codex developer instructions are delivered as the child's task briefing, so
  // template syntax in them is literal text rather than host templating.
  const agentOptions: AgentOptions = {}
  const model = role.config.model
  if (model !== undefined) {
    if (typeof model !== 'string' || !model.trim()) throw new HarnessError('Invalid Codex model.', 'CODEX_ROLE_INVALID_MODEL')
    agentOptions.model = model
  }
  const effort = role.config.model_reasoning_effort
  if (effort !== undefined) {
    if (typeof effort !== 'string' || !effort.trim()) throw new HarnessError('Invalid Codex reasoning effort.', 'CODEX_ROLE_INVALID_EFFORT')
    agentOptions.reasoningEffort = ReasoningEffortId(effort)
  }
  return { instructions: role.developerInstructions, ...(Object.keys(agentOptions).length ? { agentOptions } : {}) }
}

function requireCaller(ctx: Context, agent: Agent | undefined): Agent {
  if (!agent || ctx.agents.get(agent.id) !== agent) throw new HarnessError('Codex delegation requires an exact live calling agent.', 'CODEX_ROLE_NO_CALLER')
  return agent
}

/** Lifecycle-owned one-shot role consumer. Disabling Agents/Home cancels child work. */
export class RoleBridge {
  private closed = false
  private active = new Set<{ controller: AbortController; revision: string; done?: Promise<string>; activation?: SubagentActivation }>()
  constructor(private ctx: Context, private runtime: HomeRuntime) {}
  private current(revision: string): boolean {
    const options = this.runtime.options()
    return !this.closed && options.enabled && options.agents && JSON.stringify(options) === revision
  }
  /** Cancel in-flight children on category/Home edits without erasing their durable logs. */
  reconcile(): void {
    for (const run of this.active) {
      if (this.current(run.revision)) continue
      run.controller.abort()
      void run.activation?.dispose().catch(() => undefined)
    }
  }
  /** Start a real child with the exact live parent's composition.
   * @param parent Live calling Agent.
   * @param roleName Imported role identity.
   * @param prompt Self-contained task.
   * @param callerSignal Tool-operation cancellation.
   * @returns Serialized child result only while the authorization revision is current.
   */
  async run(parent: Agent, roleName: string, prompt: string, callerSignal: AbortSignal): Promise<string> {
    const revision = JSON.stringify(this.runtime.options())
    if (!this.current(revision)) throw new HarnessError('Codex Agents category is disabled.', 'CODEX_ROLE_NOT_AVAILABLE')
    const controller = new AbortController()
    const signal = AbortSignal.any([callerSignal, controller.signal])
    const ensure = () => {
      signal.throwIfAborted()
      if (!this.current(revision)) throw new HarnessError('Codex delegation authorization changed.', 'CODEX_ROLE_REVOKED')
      requireCaller(this.ctx, parent)
    }
    const launch = async () => {
      ensure()
      const catalog = await this.runtime.catalog(signal)
      ensure()
      const role = catalog.agents.find(row => row.name === roleName)
      if (!role) throw new HarnessError('Codex role is disabled, absent or invalid.', 'CODEX_ROLE_NOT_AVAILABLE')
      const compiled = compileRole(role)
      // The subagent service is only a registry seam. Fail before resolving a
      // model (which may contact a provider) when no native spawn exists.
      if (!this.ctx.subagents.getProvider('spawn')) throw new HarnessError('Codex delegation requires a registered DSH spawn provider and Agent implementation. No child was started.', 'CODEX_ROLE_NO_SPAWN_PROVIDER')
      const options = resolveChildAgentOptions(parent, compiled.agentOptions, resolveChildDepth(parent, undefined))
      if (compiled.agentOptions?.model) {
        if (!options.provider) throw new HarnessError('A DSH model provider is required; no Codex provider/authentication is imported.', 'CODEX_ROLE_MODEL_ROUTE')
        await this.ctx.llm.resolveModelInfo(options.provider, compiled.agentOptions.model, signal)
      }
      ensure()
      const activation = await this.ctx.subagents.startActivation({
        provider: 'spawn',
        label: `Codex: ${role.name}`,
        request: {
          parent,
          prompt: [{ type: 'text', text: compiled.instructions.trim() === '' ? prompt : `${compiled.instructions}\n\n---\n\n${prompt}` }],
          ...(compiled.agentOptions ? { agentOptions: compiled.agentOptions } : {}),
        },
        signal,
        delivery: 'caller',
      })
      owned.activation = activation
      try {
        ensure()
        const result = await activation.result
        ensure()
        return JSON.stringify(result)
      } finally { await activation.dispose() }
    }
    const owned: { controller: AbortController; revision: string; done?: Promise<string>; activation?: SubagentActivation } = { controller, revision }
    const done = launch()
    owned.done = done
    this.active.add(owned)
    try { return await done } finally { this.active.delete(owned) }
  }
  /** Stop, dispose and join in-flight child activations during plugin unload. */
  async close(): Promise<void> {
    this.closed = true
    for (const run of this.active) {
      run.controller.abort()
      void run.activation?.dispose().catch(() => undefined)
    }
    await Promise.allSettled([...this.active].flatMap(run => run.done === undefined ? [] : [run.done]))
  }
}

/** True one-shot delegation consumer, not an AgentPreset registry entry. */
const reportOutput = {
  schema: { type: 'object' as const, additionalProperties: false, properties: { report: { type: 'string' as const, required: true as const } } },
  render: (_args: unknown, value: { report: string }) => [{ type: 'text' as const, text: value.report }],
}

/** Register read-only diagnostics without requiring a model or subagent service.
 * @param ctx Tool-service contribution scope.
 * @param runtime Read-only Home catalog runtime.
 * @param mcpStatus Safe connection-status projection.
 */
export function registerCatalogTool(ctx: Context, runtime: HomeRuntime, mcpStatus: () => unknown = () => []): void {
  ctx.tools.register(defineTool({
    name: 'codex_home_catalog',
    description: 'Inspect imported Codex Home role names, skill mappings and sanitized compatibility diagnostics. Does not read credentials or execute plugins.',
    parameters: {},
    output: reportOutput,
    async execute(_args, exec) {
      const catalog = await runtime.catalog(exec.signal)
      return { report: JSON.stringify({
        agents: catalog.agents.map(role => {
          try { compileRole(role); return { name: role.name, description: role.description, policyCompatible: true } }
          catch { return { name: role.name, description: role.description, policyCompatible: false, reason: 'Non-equivalent configuration fields.' } }
        }),
        skills: catalog.skills.map(skill => ({ originalName: skill.originalName, name: skill.name, pluginId: skill.pluginId ?? null })),
        plugins: catalog.plugins.map(plugin => ({ id: plugin.id, status: plugin.status })), mcp: mcpStatus(), diagnostics: catalog.diagnostics,
      }, null, 2) }
    },
  }))
}

/** Register delegation only in a scope with live subagent/model services.
 * @param ctx Tool, subagent and model-service contribution scope.
 * @param runtime Read-only Home catalog runtime.
 */
export function registerAgentTools(ctx: Context, runtime: HomeRuntime): void {
  const roles = new RoleBridge(ctx, runtime)
  ctx.effect(() => () => roles.close())
  ctx.effect(() => {
    const timer = setInterval(() => roles.reconcile(), 1000)
    timer.unref()
    return () => clearInterval(timer)
  })
  ctx.tools.register(defineTool({
    name: 'codex_agent',
    description: 'Run one imported Codex TOML role as a real DSH one-shot subagent. Uses parent composition, tools, model route and DSH permissions, never Codex credentials. Unsupported Codex policy fields are rejected before starting. Use codex_home_catalog to find roles.',
    parameters: { role: { type: 'string', required: true, description: 'Exact imported role name.' }, prompt: { type: 'string', required: true, description: 'Self-contained task for the role.' } },
    output: reportOutput,
    async execute(args, exec) {
      const parent = requireCaller(ctx, exec.agent)
      return { report: await roles.run(parent, args.role, args.prompt, exec.signal) }
    },
  }))
}
