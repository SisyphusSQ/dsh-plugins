/**
 * plugin.json / mcp.json manifest validation (Agent Plugins 1.0.0, spec §5 / §7.2.1).
 *
 * Pure functions over text/JSON — no filesystem, no network. Path containment
 * (including symlink resolution) lives in store.ts where fs is available.
 *
 * Failure boundaries follow the spec:
 * - plugin.json: $schema mismatch / missing name / name-format violation → the
 *   WHOLE plugin is rejected (`ok: false`). Unknown top-level fields are
 *   reported and ignored; other type oddities are issues, not fatal.
 * - mcp.json: top-level is closed ($schema + mcpServers only) — an extra field
 *   disables the whole MCP half but nothing else. One bad server invalidates
 *   only that server; `sse` is unsupported → skip with a warning.
 */

/** Spec §5: the only accepted plugin schema URL. */
export const PLUGIN_SCHEMA_URL = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
/** Spec §7.2.1: the mcp.json schema URL (must match the plugin's version). */
export const MCP_SCHEMA_URL = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'

/** One validation finding. `fatal` findings fail the containing unit. */
export interface ManifestIssue {
  /** Path-ish label of the offending field, e.g. `plugin.json#/name`. */
  path: string
  message: string
  fatal?: boolean
}

/** Validated plugin.json projection (unknown fields are dropped, not preserved). */
export interface PluginManifest {
  name: string
  version?: string
  description?: string
  author?: unknown
  homepage?: unknown
  repository?: unknown
  license?: unknown
  keywords?: unknown
  extensions?: unknown
}

/** Validated mcp.json server (raw, before mapping to dsh-mcp-client config). */
export interface McpServerEntry {
  name: string
  type: 'stdio' | 'streamable-http' | 'sse'
  /** stdio fields */
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  /** http fields */
  url?: string
  headers?: Record<string, string>
}

export interface ParseResult<T> {
  ok: boolean
  value: T | undefined
  issues: ManifestIssue[]
}

/** Unknown top-level plugin.json keys are allowed by the closed schema but reported. */
const PLUGIN_TOP_LEVEL_KEYS = new Set([
  '$schema', 'name', 'version', 'description', 'author', 'homepage',
  'repository', 'license', 'keywords', 'extensions',
])

/**
 * Spec §5.5 name constraint: 1–64 chars, lowercase alphanumerics plus `-` / `.`,
 * starts and ends alphanumeric, no `--` and no `..`.
 */
export function isValidPluginName(name: unknown): name is string {
  if (typeof name !== 'string') return false
  if (name.length < 1 || name.length > 64) return false
  if (!/^[a-z0-9]([a-z0-9-.]*[a-z0-9])?$/.test(name)) return false
  if (name.includes('--') || name.includes('..')) return false
  return true
}

/**
 * Validate one plugin.json document.
 * @param text - raw plugin.json content.
 * @returns the validated manifest projection plus every finding.
 */
export function parsePluginManifest(text: string): ParseResult<PluginManifest> {
  const issues: ManifestIssue[] = []
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return {
      ok: false,
      value: undefined,
      issues: [{ path: 'plugin.json', message: `not valid JSON: ${error instanceof Error ? error.message : String(error)}`, fatal: true }],
    }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, value: undefined, issues: [{ path: 'plugin.json', message: 'top level must be an object', fatal: true }] }
  }
  const obj = raw as Record<string, unknown>

  // $schema: must be exactly the 1.0.0 plugin schema URL.
  if (obj['$schema'] !== PLUGIN_SCHEMA_URL) {
    return { ok: false, value: undefined, issues: [{ path: 'plugin.json#/$schema', message: `unsupported or missing $schema; expected ${PLUGIN_SCHEMA_URL}`, fatal: true }] }
  }

  // Closed schema: unknown top-level fields are reported and ignored.
  for (const key of Object.keys(obj)) {
    if (!PLUGIN_TOP_LEVEL_KEYS.has(key)) {
      issues.push({ path: `plugin.json#/${key}`, message: `unknown top-level field; ignored` })
    }
  }

  // name: required + format constraint.
  if (!isValidPluginName(obj.name)) {
    return { ok: false, value: undefined, issues: [{ path: 'plugin.json#/name', message: 'name is required and must match [a-z0-9]([a-z0-9-.]*[a-z0-9])? (1–64 chars, no --, no ..)', fatal: true }] }
  }

  const manifest: PluginManifest = { name: obj.name }
  if (obj.version !== undefined) {
    if (typeof obj.version === 'string') manifest.version = obj.version
    else issues.push({ path: 'plugin.json#/version', message: 'version must be a string; ignored' })
  }
  if (obj.description !== undefined) {
    if (typeof obj.description === 'string') manifest.description = obj.description
    else issues.push({ path: 'plugin.json#/description', message: 'description must be a string; ignored' })
  }
  for (const field of ['author', 'homepage', 'repository', 'license', 'keywords'] as const) {
    if (obj[field] !== undefined) manifest[field] = obj[field]
  }
  if (obj.extensions !== undefined) {
    if (typeof obj.extensions === 'object' && obj.extensions !== null && !Array.isArray(obj.extensions)) {
      manifest.extensions = obj.extensions
    } else {
      issues.push({ path: 'plugin.json#/extensions', message: 'extensions must be an object; ignored' })
    }
  }
  return { ok: true, value: manifest, issues }
}

/** Known mcp.json top-level keys. */
const MCP_TOP_LEVEL_KEYS = new Set(['$schema', 'mcpServers'])
/** Known per-server keys per variant. */
const STDTO_KEYS = new Set(['type', 'command', 'args', 'env', 'cwd'])
const HTTP_KEYS = new Set(['type', 'url', 'headers'])
const SSE_KEYS = new Set(['type', 'url', 'headers'])

/**
 * Spec §7.2.1 URL rule: absolute http(s), no userinfo, no fragment; loopback
 * hosts may use http, everything else must be https.
 */
export function isValidServerUrl(url: string): { ok: true } | { ok: false; reason: string } {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: `"${url}" is not an absolute URL` }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `"${url}" must use http(s)` }
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, reason: `"${url}" must not carry userinfo` }
  }
  if (parsed.hash !== '') {
    return { ok: false, reason: `"${url}" must not carry a fragment` }
  }
  const host = parsed.hostname
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || /^127\./.test(host)
  if (parsed.protocol === 'http:' && !isLoopback) {
    return { ok: false, reason: `"${url}" must use https outside loopback` }
  }
  return { ok: true }
}

/**
 * Validate one mcp.json document. Independent from plugin.json: a bad MCP
 * half never fails the other components.
 * @param text - raw mcp.json content.
 * @returns validated servers (sse ones are reported as skipped but kept typed) plus findings.
 */
export function parseMcpManifest(text: string): ParseResult<McpServerEntry[]> {
  const issues: ManifestIssue[] = []
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return { ok: false, value: undefined, issues: [{ path: 'mcp.json', message: `not valid JSON: ${error instanceof Error ? error.message : String(error)}`, fatal: true }] }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, value: undefined, issues: [{ path: 'mcp.json', message: 'top level must be an object', fatal: true }] }
  }
  const obj = raw as Record<string, unknown>

  // Closed top level: only $schema + mcpServers.
  for (const key of Object.keys(obj)) {
    if (!MCP_TOP_LEVEL_KEYS.has(key)) {
      return { ok: false, value: undefined, issues: [{ path: `mcp.json#/${key}`, message: 'unknown top-level field; the whole MCP half is disabled', fatal: true }] }
    }
  }
  if (obj['$schema'] !== MCP_SCHEMA_URL) {
    return { ok: false, value: undefined, issues: [{ path: 'mcp.json#/$schema', message: `must be ${MCP_SCHEMA_URL} (same version as plugin.json)`, fatal: true }] }
  }
  if (obj.mcpServers === undefined) {
    return { ok: false, value: undefined, issues: [{ path: 'mcp.json#/mcpServers', message: 'mcpServers is required', fatal: true }] }
  }
  if (typeof obj.mcpServers !== 'object' || obj.mcpServers === null || Array.isArray(obj.mcpServers)) {
    return { ok: false, value: undefined, issues: [{ path: 'mcp.json#/mcpServers', message: 'mcpServers must be an object', fatal: true }] }
  }
  const serversRaw = obj.mcpServers as Record<string, unknown>
  const servers: McpServerEntry[] = []

  for (const [name, value] of Object.entries(serversRaw)) {
    // Per-server failures only invalidate that server.
    const serverIssues: ManifestIssue[] = []
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ path: `mcp.json#/mcpServers/${name}`, message: 'server entry must be an object; server invalid' })
      continue
    }
    const entry = value as Record<string, unknown>
    if (typeof entry.type !== 'string') {
      issues.push({ path: `mcp.json#/mcpServers/${name}/type`, message: 'type is required; server invalid' })
      continue
    }
    if (entry.type === 'stdio') {
      for (const key of Object.keys(entry)) {
        if (!STDTO_KEYS.has(key)) serverIssues.push({ path: `mcp.json#/mcpServers/${name}/${key}`, message: `unknown stdio field` })
      }
      if (typeof entry.command !== 'string' || entry.command.length === 0) {
        serverIssues.push({ path: `mcp.json#/mcpServers/${name}/command`, message: 'stdio command is required' })
      }
      if (entry.args !== undefined && (!Array.isArray(entry.args) || entry.args.some((a) => typeof a !== 'string'))) {
        serverIssues.push({ path: `mcp.json#/mcpServers/${name}/args`, message: 'args must be a string array' })
      }
      if (entry.env !== undefined && (typeof entry.env !== 'object' || entry.env === null || Array.isArray(entry.env))) {
        serverIssues.push({ path: `mcp.json#/mcpServers/${name}/env`, message: 'env must be an object' })
      } else if (entry.env !== undefined) {
        for (const [k, v] of Object.entries(entry.env as Record<string, unknown>)) {
          if (typeof v !== 'string') serverIssues.push({ path: `mcp.json#/mcpServers/${name}/env/${k}`, message: 'env values must be strings' })
        }
      }
      if (entry.cwd !== undefined && typeof entry.cwd !== 'string') {
        serverIssues.push({ path: `mcp.json#/mcpServers/${name}/cwd`, message: 'cwd must be a string' })
      }
      if (serverIssues.length > 0) {
        issues.push(...serverIssues)
        continue
      }
      servers.push({
        name,
        type: 'stdio',
        command: entry.command as string,
        ...(entry.args !== undefined ? { args: entry.args as string[] } : {}),
        ...(entry.env !== undefined ? { env: entry.env as Record<string, string> } : {}),
        ...(entry.cwd !== undefined ? { cwd: entry.cwd as string } : {}),
      })
    } else if (entry.type === 'streamable-http' || entry.type === 'sse') {
      const variant = entry.type
      for (const key of Object.keys(entry)) {
        if (variant === 'streamable-http' && !HTTP_KEYS.has(key)) serverIssues.push({ path: `mcp.json#/mcpServers/${name}/${key}`, message: `unknown ${variant} field` })
        if (variant === 'sse' && !SSE_KEYS.has(key)) serverIssues.push({ path: `mcp.json#/mcpServers/${name}/${key}`, message: `unknown ${variant} field` })
      }
      if (typeof entry.url !== 'string') {
        serverIssues.push({ path: `mcp.json#/mcpServers/${name}/url`, message: `${variant} url is required` })
      } else {
        const urlCheck = isValidServerUrl(entry.url)
        if (!urlCheck.ok) serverIssues.push({ path: `mcp.json#/mcpServers/${name}/url`, message: urlCheck.reason })
      }
      if (entry.headers !== undefined) {
        if (typeof entry.headers !== 'object' || entry.headers === null || Array.isArray(entry.headers)) {
          serverIssues.push({ path: `mcp.json#/mcpServers/${name}/headers`, message: 'headers must be an object' })
        } else {
          const headers = entry.headers as Record<string, unknown>
          const seen = new Map<string, string>()
          for (const [k, v] of Object.entries(headers)) {
            const lower = k.toLowerCase()
            const prior = seen.get(lower)
            if (prior !== undefined && prior !== k) {
              serverIssues.push({ path: `mcp.json#/mcpServers/${name}/headers`, message: `header "${lower}" appears with different casing (${prior} vs ${k})` })
            }
            seen.set(lower, k)
            if (typeof v !== 'string') serverIssues.push({ path: `mcp.json#/mcpServers/${name}/headers/${k}`, message: 'header values must be strings' })
          }
        }
      }
      if (serverIssues.length > 0) {
        issues.push(...serverIssues)
        continue
      }
      if (variant === 'sse') {
        issues.push({ path: `mcp.json#/mcpServers/${name}`, message: 'sse transport is unsupported; server skipped' })
        continue
      }
      servers.push({
        name,
        type: 'streamable-http',
        url: entry.url as string,
        ...(entry.headers !== undefined ? { headers: entry.headers as Record<string, string> } : {}),
      })
    } else {
      issues.push({ path: `mcp.json#/mcpServers/${name}/type`, message: `unknown type "${entry.type}"; server invalid` })
    }
  }
  return { ok: true, value: servers, issues }
}
