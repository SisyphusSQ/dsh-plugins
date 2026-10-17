import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-skill'
import z from '@deepseek-ai/schemastery'
import { HomeRuntime, catalogFingerprint } from './runtime.js'
import { registerAgentTools, registerCatalogTool } from './agents.js'
import { McpBridge } from './mcp.js'
import { instructionUpdate } from './instructions.js'
import { DiagnosticsService } from './diagnostics.js'
import { HookBridge, registerHooks } from './hooks.js'
import type { BridgeOptions } from './types.js'
export { scanHome, catalogView } from './catalog.js'

export const name = 'dsh-codex-bridge'
export const inject = ['skills', 'agents']
export interface Config {
  home: Volatile<string>
  enabled: Volatile<boolean>
  instructions: Volatile<boolean>
  skills: Volatile<boolean>
  plugins: Volatile<boolean>
  agents: Volatile<boolean>
  connectMcp: Volatile<boolean>
  executeHooks: Volatile<boolean>
  maxFileBytes: number
  maxEntries: number
  maxDepth: number
  hookTimeoutMs: number
}
export const Config = z.object({
  home: z.string().default(process.env.CODEX_HOME || resolve(homedir(), '.codex')).description('Read-only Codex Home. Credentials are never imported; authentication is configured independently in DSH.').volatile(),
  enabled: z.boolean().default(false).description('Enable the whole Codex Home bridge.').volatile(),
  instructions: z.boolean().default(true).description('Read Home AGENTS.override.md or AGENTS.md.').volatile(),
  skills: z.boolean().default(true).description('Import the entire Home Skills category (not plugin-owned skills).').volatile(),
  plugins: z.boolean().default(true).description('Import the entire effectively-enabled Codex Plugins category, including its skills.').volatile(),
  agents: z.boolean().default(true).description('Import the entire custom TOML Agents category.').volatile(),
  connectMcp: z.boolean().default(false).description('Authorize credential-free MCP programs and connections through the native DSH client. Configure authentication independently in DSH.').volatile(),
  executeHooks: z.boolean().default(false).description('Authorize execution of supported local hooks.').volatile(),
  maxFileBytes: z.number().min(1024).max(4 * 1024 * 1024).step(1).default(1024 * 1024),
  maxEntries: z.number().min(1).max(100000).step(1).default(10000),
  maxDepth: z.number().min(1).max(32).step(1).default(8),
  hookTimeoutMs: z.number().min(1).max(86400000).step(1).default(600000),
})

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'suqingsq-codex-home': { kind: 'suqingsq-codex-home'; form: 'instructions'; home: string; digest: string; enabled: boolean }
  }
}

/** Host capability registration. Runtime additions are owned by this plugin instance. */
export function apply(ctx: Context, config: Config): void {
  const options = (): BridgeOptions => ({
    home: resolve(config.home.get()), enabled: config.enabled.get(), instructions: config.instructions.get(),
    skills: config.skills.get(), plugins: config.plugins.get(), agents: config.agents.get(),
    connectMcp: config.connectMcp.get(), executeHooks: config.executeHooks.get(),
    maxFileBytes: config.maxFileBytes, maxEntries: config.maxEntries, maxDepth: config.maxDepth,
  })
  const runtime = new HomeRuntime(options)
  new DiagnosticsService(ctx, runtime)
  ctx.effect(() => () => runtime.close())
  ctx.inject(['tools'], child => {
    const mcp = new McpBridge(child, runtime)
    child.effect(() => () => mcp.close())
    child.effect(() => {
      const timer = setInterval(() => { void mcp.reconcile().catch(() => {}) }, 1000)
      timer.unref()
      void mcp.reconcile().catch(() => {})
      return () => clearInterval(timer)
    })
    registerCatalogTool(child, runtime, () => mcp.snapshot())
    child.inject(['subagents', 'llm'], tools => registerAgentTools(tools, runtime))
  })
  ctx.inject(['shell', 'sessionProjections', 'tools'], child => {
    const hooks = new HookBridge(child, runtime, config.hookTimeoutMs)
    registerHooks(child, hooks)
    child.effect(() => () => hooks.close())
    child.effect(() => {
      const timer = setInterval(() => hooks.reconcile(), 1000)
      timer.unref()
      return () => clearInterval(timer)
    })
  })
  ctx.inject(['settings'], child => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)))
  let invalidate: (() => void) | undefined
  ctx.skills.registerProvider(control => {
    invalidate = control.invalidate
    return {
      name: 'suqingsq-codex-bridge-home',
      async list(lookup) {
        const catalog = await runtime.catalog(lookup.signal)
        return catalog.skills.map(skill => ({
          name: skill.name, description: skill.description, path: skill.path,
          invocation: { modelInvocable: skill.modelInvocable, userInvocable: skill.userInvocable },
          source: 'codex-home', provider: 'suqingsq-codex-bridge-home', rank: 600,
          resourceBase: { kind: 'directory' as const, path: skill.resourceDirectory }, locator: skill,
        }))
      },
      async get(candidate, lookup) {
        const catalog = await runtime.catalog(lookup.signal)
        const skill = catalog.skills.find(row => row.name === candidate.name)
        if (!skill) return undefined
        const content = await runtime.body(skill, lookup.signal)
        if (content === undefined) return undefined
        return {
          name: skill.name, description: skill.description, path: skill.path,
          invocation: { modelInvocable: skill.modelInvocable, userInvocable: skill.userInvocable },
          source: 'codex-home', provider: 'suqingsq-codex-bridge-home',
          resourceBase: { kind: 'directory' as const, path: skill.resourceDirectory }, content,
        }
      },
    }
  })
  // Registry catalogs are cached; invalidate them on category edits and Home changes.
  let fingerprint = ''
  let checking = false
  const check = async () => {
    if (checking) return
    checking = true
    try {
      const catalog = await runtime.catalog()
      const next = catalogFingerprint(catalog, options())
      if (next !== fingerprint) { fingerprint = next; invalidate?.() }
    } catch { /* Disposal/invalid Home is handled by the next caller's observation. */ }
    finally { checking = false }
  }
  ctx.effect(() => {
    const timer = setInterval(() => { void check() }, 1000)
    timer.unref()
    return () => clearInterval(timer)
  })
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const catalog = await runtime.catalog(signal)
    const message = instructionUpdate(agent, decision.messages, catalog)
    return message ? { ...decision, messages: [message, ...decision.messages] } : decision
  }, { prepend: true })
}
