/**
 * mcp.json → dsh-mcp-client config mapping (spec §7.2, §9.1).
 *
 * Pure functions (string/parse level). Symlink-aware containment is enforced
 * by store.ts at install time; this module does resolve-level containment for
 * the fields the spec names (command, cwd).
 *
 * Mapping rules (see docs/design/dsh-agent-plugins.md §M3):
 * - stdio      → { transport: 'stdio', command, args, env, cwd }
 * - streamable-http → { transport: 'streamable-http', url, headers }
 * - sse        → skipped with a warning (handled in manifest.ts)
 * - command is a SINGLE token: bare name or `./`-relative path. Shell strings
 *   are invalid; placeholders are NOT expanded in command, env keys, url, headers.
 * - cwd omitted → plugin root; explicit cwd only `./` | `${PLUGIN_ROOT}` | `${PLUGIN_DATA}`.
 * - ${PLUGIN_ROOT} / ${PLUGIN_DATA} expand in args values, env values and cwd
 *   only, once, non-recursively; containment is re-checked after expansion.
 * - env keys must not be the reserved PLUGIN_ROOT / PLUGIN_DATA (spec §9.1);
 *   both variables are always injected explicitly by the adapter.
 */
import { isAbsolute, relative, resolve } from 'node:path'
import type { ManifestIssue, McpServerEntry } from './manifest.js'

/** Spec §9.1 reserved environment variables, injected by the adapter. */
export const PLUGIN_ROOT_ENV = 'PLUGIN_ROOT'
export const PLUGIN_DATA_ENV = 'PLUGIN_DATA'
export const RESERVED_ENV_KEYS = [PLUGIN_ROOT_ENV, PLUGIN_DATA_ENV] as const

/** dsh-mcp-client compatible server config (the adapter's projection). */
export interface McpClientConfig {
  serverName: string
  transport: 'stdio' | 'streamable-http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
}

/** Expansion context for one plugin instance. */
export interface McpMappingContext {
  /** Validated plugin name (manifest constraint already applied). */
  pluginName: string
  /** Absolute store path of the plugin root. */
  pluginRoot: string
  /** Absolute PLUGIN_DATA directory for this plugin. */
  pluginDataDir: string
}

export interface McpMappingResult {
  configs: McpClientConfig[]
  issues: ManifestIssue[]
}

/**
 * Spec §7.2.1 server-name constraint: `[A-Za-z0-9_-]{1,32}`.
 * Plugin names may contain `.` (manifest name rule); the qualifier replaces
 * it with `_` so the combined `<plugin>__<server>` stays in the safe set.
 */
export function qualifyServerName(pluginName: string, serverName: string): string | { error: string } {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(serverName)) {
    return { error: `server name "${serverName}" must match [A-Za-z0-9_-]{1,32}` }
  }
  const qualifier = pluginName.replace(/\./g, '_')
  const combined = `${qualifier}__${serverName}`
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(combined)) {
    return { error: `qualified server name "${combined}" must match [A-Za-z0-9_-]{1,32}` }
  }
  return combined
}

/** Stable patch row id for one server (used by patch-sync in M3). */
export function mcpRowId(pluginName: string, serverName: string): string {
  const qualifier = pluginName.replace(/\./g, '_')
  return `ap-mcp-${qualifier}-${serverName}`
}

/**
 * Expand ${PLUGIN_ROOT} / ${PLUGIN_DATA} in one value, once, non-recursively.
 * Unknown ${...} tokens are left untouched (they may be meaningful to the
 * server's own runtime).
 */
export function expandPlaceholders(value: string, ctx: McpMappingContext): string {
  return value
    .replace('${PLUGIN_ROOT}', ctx.pluginRoot)
    .replace('${PLUGIN_DATA}', ctx.pluginDataDir)
}

/** Resolve-level containment: is `target` inside `root` (string comparison, no fs)? */
export function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Resolve an explicit cwd. Allowed forms: `./`, `${PLUGIN_ROOT}`, `${PLUGIN_DATA}`.
 * Omission defaults to the plugin root (handled by the caller).
 */
export function resolveCwd(cwd: string | undefined, ctx: McpMappingContext): string | { error: string } {
  if (cwd === undefined) return ctx.pluginRoot
  if (cwd === './') return ctx.pluginRoot
  if (cwd === '${PLUGIN_ROOT}') return ctx.pluginRoot
  if (cwd === '${PLUGIN_DATA}') return ctx.pluginDataDir
  return { error: `cwd must be ./ or \${PLUGIN_ROOT} or \${PLUGIN_DATA}, got "${cwd}"` }
}

/**
 * Validate one stdio command: a single token — a bare name (resolved via PATH)
 * or a `./`-relative path inside the plugin root. Absolute paths must stay
 * inside the plugin root. Shell strings (whitespace, quoting) are invalid.
 */
export function validateCommand(command: string, ctx: McpMappingContext): string | { error: string } {
  if (command.length === 0) return { error: 'command must not be empty' }
  if (/\s/.test(command) || /['"\\]/.test(command)) {
    return { error: `command "${command}" must be a single token (no shell syntax)` }
  }
  if (command.startsWith('./')) {
    const resolved = resolve(ctx.pluginRoot, command)
    if (!isWithin(ctx.pluginRoot, resolved)) {
      return { error: `command "${command}" escapes the plugin root` }
    }
    return resolved
  }
  if (command.startsWith('../') || command === '..') {
    return { error: `command "${command}" escapes the plugin root` }
  }
  if (isAbsolute(command)) {
    if (!isWithin(ctx.pluginRoot, command)) {
      return { error: `absolute command "${command}" escapes the plugin root` }
    }
    return command
  }
  // Bare name: PATH resolution happens at spawn time (dsh-mcp-client).
  return command
}

/**
 * Map validated mcp.json servers to dsh-mcp-client configs.
 * Per-server failures produce issues and skip only that server.
 */
export function mapMcpServers(
  pluginName: string,
  servers: McpServerEntry[],
  ctx: McpMappingContext,
): McpMappingResult {
  const configs: McpClientConfig[] = []
  const issues: ManifestIssue[] = []

  for (const server of servers) {
    const label = `mcp.json#/mcpServers/${server.name}`
    const qualified = qualifyServerName(pluginName, server.name)
    if (typeof qualified === 'object') {
      issues.push({ path: label, message: qualified.error })
      continue
    }
    if (server.type === 'sse') {
      issues.push({ path: label, message: 'sse transport is unsupported; server skipped' })
      continue
    }
    if (server.type === 'stdio') {
      if (server.command === undefined) {
        issues.push({ path: label, message: 'stdio command is required; server invalid' })
        continue
      }
      const command = validateCommand(server.command, ctx)
      if (typeof command === 'object') {
        issues.push({ path: `${label}/command`, message: command.error })
        continue
      }
      const cwd = resolveCwd(server.cwd, ctx)
      if (typeof cwd === 'object') {
        issues.push({ path: `${label}/cwd`, message: cwd.error })
        continue
      }
      const env: Record<string, string> = {}
      if (server.env !== undefined) {
        let reserved = false
        for (const key of Object.keys(server.env)) {
          if (RESERVED_ENV_KEYS.includes(key as (typeof RESERVED_ENV_KEYS)[number])) {
            issues.push({ path: `${label}/env/${key}`, message: `env key "${key}" is reserved` })
            reserved = true
          }
        }
        if (reserved) continue
        for (const [key, value] of Object.entries(server.env)) {
          env[key] = expandPlaceholders(value, ctx)
        }
      }
      const args = server.args?.map((arg) => expandPlaceholders(arg, ctx)) ?? []
      configs.push({
        serverName: qualified,
        transport: 'stdio',
        command,
        args,
        env,
        cwd,
      })
      continue
    }
    // streamable-http: url/headers pass through (placeholders are not expanded;
    // manifest.ts already enforced the URL rules).
    configs.push({
      serverName: qualified,
      transport: 'streamable-http',
      ...(server.url !== undefined ? { url: server.url } : {}),
      ...(server.headers !== undefined ? { headers: server.headers } : {}),
    })
  }
  return { configs, issues }
}
