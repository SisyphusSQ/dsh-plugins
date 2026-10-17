import type { Context } from '@deepseek-ai/cordis'
import * as mcpClient from '@deepseek-ai/dsh-mcp-client'
import { resolve } from 'node:path'
import { digest, mcpBlockedReason } from './parse.js'
import type { HomeMcp } from './types.js'
import type { HomeRuntime } from './runtime.js'

export function mcpServerName(id: string): string { return `codex_${digest(id).slice(0, 20)}` }

/** Translate credential-free Codex transport fields; never silently discard policy. */
export function compileMcp(row: HomeMcp): mcpClient.Config {
  const config = row.config
  const blocked = mcpBlockedReason(config)
  if (blocked) throw new Error(blocked)
  const http = config.url !== undefined
  const supported = new Set(['type', 'enabled', 'tool_timeout_sec', ...(http ? ['url'] : ['command', 'args', 'cwd'])])
  if (config.type !== undefined && config.type !== (http ? 'http' : 'stdio')) throw new Error('MCP specifies conflicting transport type.')
  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') throw new Error('Invalid MCP enabled flag.')
  if (Object.keys(config).some(key => !supported.has(key))) throw new Error('MCP has unsupported configuration fields; no connection was opened.')
  const timeout = config.tool_timeout_sec === undefined ? 60 : config.tool_timeout_sec
  if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0 || timeout > 2147483) throw new Error('Invalid MCP tool timeout.')
  const common = { serverName: mcpServerName(row.id), toolCallTimeoutMs: timeout * 1000, failOnStartupError: true, reconnect: { enabled: false } }
  if (config.url !== undefined) {
    if (typeof config.url !== 'string') throw new Error('Invalid MCP URL.')
    return { ...common, transport: 'streamable-http', url: config.url, headers: {} }
  }
  if (typeof config.command !== 'string' || !config.command.trim()) throw new Error('Invalid MCP command.')
  if (config.args !== undefined && (!Array.isArray(config.args) || config.args.some(v => typeof v !== 'string'))) throw new Error('Invalid MCP arguments.')
  if (config.cwd !== undefined && typeof config.cwd !== 'string') throw new Error('Invalid MCP cwd.')
  // ${CODEX_PLUGIN_ROOT} is the only portable substitution allowed; no shell or
  // ambient credential references are evaluated by this importer.
  const substitute = (value: string): string => {
    const next = value.replaceAll('${CODEX_PLUGIN_ROOT}', row.root)
    if (/\$\{|\$\(/u.test(next)) throw new Error('MCP contains unsupported environment interpolation.')
    return next
  }
  return { ...common, transport: 'stdio', env: {}, command: substitute(config.command), args: (config.args as string[] | undefined ?? []).map(substitute), cwd: resolve(row.root, substitute(typeof config.cwd === 'string' ? config.cwd : '.')) }
}

export interface McpStatus { id: string; serverName: string; state: 'connecting' | 'connected' | 'blocked' | 'failed'; reason?: string }

interface McpOwner { await(): Promise<unknown>; dispose(): Promise<unknown> }

/** Own imported MCP transports. Revoke old owners before replacing them. */
export class McpBridge {
  private readonly mounted = new Map<string, { key: string; fiber: McpOwner; row: HomeMcp; home: string; revoked: boolean; state: McpStatus['state'] }>()
  private readonly statuses = new Map<string, McpStatus>()
  private closed = false
  private updating: Promise<void> | undefined
  constructor(private readonly ctx: Context, private readonly runtime: HomeRuntime) {
    ctx.tools.guard(exec => {
      const entry = [...this.mounted.values()].find(entry => exec.name.startsWith(`mcp__${mcpServerName(entry.row.id)}__`))
      if (!entry) return undefined
      const options = runtime.options()
      return this.closed || entry.revoked || options.home !== entry.home || !options.enabled || !options.connectMcp || (entry.row.pluginId && !options.plugins) ? 'Codex MCP category authorization has been revoked.' : undefined
    })
  }
  snapshot(): McpStatus[] { return [...this.statuses.values()].map(row => ({ ...row })) }
  reconcile(): Promise<void> {
    if (this.closed) return Promise.resolve()
    return this.updating ??= this.update().finally(() => { this.updating = undefined })
  }
  private async update(): Promise<void> {
    const catalog = await this.runtime.catalog()
    const options = { ...this.runtime.options() }
    const desired = new Map<string, { row: HomeMcp; config: mcpClient.Config; serverName: string; key: string }>()
    this.statuses.clear()
    if (options.enabled && options.connectMcp && !this.closed) {
      for (const row of catalog.mcp) {
        if (!row.enabled || (row.pluginId && !options.plugins)) continue
        try {
          const config = compileMcp(row)
          desired.set(row.id, { row, config, serverName: mcpServerName(row.id), key: digest(JSON.stringify([options.home, row.root, row.config])) })
        } catch {
          // Never project parser/transport errors, command lines, env, or headers.
          this.statuses.set(row.id, { id: row.id, serverName: mcpServerName(row.id), state: 'blocked', reason: mcpBlockedReason(row.config) ?? 'Unsupported or conflicting MCP configuration; configure this server independently in DSH.' })
        }
      }
    }
    for (const [id, current] of this.mounted) {
      if (this.closed || desired.get(id)?.key !== current.key) {
        current.revoked = true
        await current.fiber.dispose()
        this.mounted.delete(id)
      }
    }
    for (const [id, next] of desired) {
      if (this.closed) break
      const live = this.runtime.options()
      if (live.home !== options.home || !live.enabled || !live.connectMcp || (next.row.pluginId && !live.plugins)) break
      const existing = this.mounted.get(id)
      if (existing) {
        this.statuses.set(id, { id, serverName: next.serverName, state: existing.state })
        continue
      }
      const fiber: McpOwner = this.ctx.plugin(mcpClient, next.config)
      const entry = { key: next.key, fiber, row: next.row, home: options.home, revoked: false, state: 'connecting' as McpStatus['state'] }
      this.mounted.set(id, entry)
      this.statuses.set(id, { id, serverName: next.serverName, state: 'connecting' })
      // Retain ownership before awaiting startup, so revocation can stop a
      // server that is still handshaking rather than waiting for startup first.
      void fiber.await().then(() => {
        if (this.mounted.get(id) === entry && !entry.revoked && !this.closed) { entry.state = 'connected'; this.statuses.set(id, { id, serverName: next.serverName, state: 'connected' }) }
      }, async () => {
        if (this.mounted.get(id) !== entry || entry.revoked || this.closed) return
        entry.state = 'failed'
        this.statuses.set(id, { id, serverName: next.serverName, state: 'failed', reason: 'MCP startup failed; transport details are intentionally omitted.' })
        // Keep failed identity to avoid a new process every poll. Config change,
        // category off/on, or plugin reload permits another attempt.
        await fiber.dispose().catch(() => {})
      })
    }
  }
  async close(): Promise<void> {
    this.closed = true
    await Promise.all([...this.mounted.values()].map(row => row.fiber.dispose()))
    this.mounted.clear()
    await this.updating?.catch(() => {})
    this.statuses.clear()
  }
}
