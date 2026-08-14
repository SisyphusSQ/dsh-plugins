/**
 * MCP half sync: scan machine-level stores, map enabled servers to
 * dsh-mcp-client rows, and rewrite the managed section of the home patch.
 *
 * - only machine-level stores contribute MCP servers (2026-08-14 decision;
 *   project-level stores are skills-only);
 * - a server is enabled when the plugin row exists and is enabled AND its
 *   component state is not explicitly disabled;
 * - every sync rewrites the whole managed section (id-stable rows), so a
 *   single-server toggle only ever adds/removes that one row's text.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseMcpManifest } from './manifest.js'
import { mapMcpServers, type McpMappingContext } from './mcp-map.js'
import { entriesForServers, syncPatchFile, type McpPatchEntry } from './patch-sync.js'
import { scanStore, type Ledger } from './store.js'

/** Guard rail: more servers than this in one plugin triggers a warning. */
export const MAX_SERVERS_PER_PLUGIN = 10

/** Guard rail: header keys/values that look like credentials trigger a warning. */
const CREDENTIAL_HEADER_RE = /authorization|bearer|api[_-]?key|token/i

export interface McpSyncOptions {
  /** Machine-level store directories (project stores contribute no MCP). */
  storeDirs: string[]
  /** PLUGIN_DATA root ($DSH_HOME/agent-plugins-data). */
  dataRoot: string
  /** Home patch file to manage ($DSH_HOME/cordis.patch.yml). */
  managedPatch: string
  readLedger: () => Ledger
  warn: (message: string) => void
}

export interface McpSyncResult {
  changed: boolean
  error?: string
  entries: McpPatchEntry[]
}

/**
 * Recompute the desired MCP rows without writing (doctor / panel use this).
 * Guard rails: per-plugin server count, credential-shaped headers.
 */
export async function computeMcpEntries(opts: McpSyncOptions): Promise<McpPatchEntry[]> {
  const ledger = opts.readLedger()
  const desired: McpPatchEntry[] = []

  for (const storeDir of opts.storeDirs) {
    for (const plugin of await scanStore(storeDir)) {
      const row = ledger.plugins[plugin.name]
      if (row === undefined || !row.enabled) continue
      let mcpText: string
      try {
        mcpText = await readFile(join(plugin.dir, 'mcp.json'), 'utf8')
      } catch {
        continue // no MCP half
      }
      const parsed = parseMcpManifest(mcpText)
      if (!parsed.ok || parsed.value === undefined) {
        for (const issue of parsed.issues) opts.warn(`${plugin.name}: ${issue.message}`)
        continue
      }
      if (parsed.value.length > MAX_SERVERS_PER_PLUGIN) {
        opts.warn(`${plugin.name}: ${parsed.value.length} MCP servers exceed the ${MAX_SERVERS_PER_PLUGIN} guard rail; check the plugin`)
      }
      const mapping: McpMappingContext = {
        pluginName: plugin.name,
        pluginRoot: plugin.dir,
        pluginDataDir: join(opts.dataRoot, plugin.name),
      }
      // Map one server at a time so the raw server name stays available for
      // the component-level filter and the stable row id.
      for (const server of parsed.value) {
        const { configs, issues } = mapMcpServers(plugin.name, [server], mapping)
        if (configs.length === 0) {
          for (const issue of issues) opts.warn(`${plugin.name}: ${issue.message}`)
          continue
        }
        const config = configs[0]!
        if (config.transport === 'streamable-http' && config.headers !== undefined) {
          for (const [key, value] of Object.entries(config.headers)) {
            if (CREDENTIAL_HEADER_RE.test(key) || CREDENTIAL_HEADER_RE.test(value)) {
              opts.warn(`${plugin.name}: header "${key}" looks like a credential; make sure it is not committed to the store`)
              break
            }
          }
        }
        // Component-level filter: server explicitly disabled → skip.
        const state = row.mcp[config.serverName]
        if (state !== undefined && !state.enabled) continue
        desired.push(...entriesForServers([{ pluginName: plugin.name, serverName: server.name, config }]))
      }
    }
  }
  return desired
}

/**
 * Recompute and apply the managed MCP rows.
 * @returns the applied entries and whether the file changed.
 */
export async function syncMcpRows(opts: McpSyncOptions): Promise<McpSyncResult> {
  const desired = await computeMcpEntries(opts)
  const result = await syncPatchFile(opts.managedPatch, desired)
  return {
    changed: result.changed,
    ...(result.error !== undefined ? { error: result.error } : {}),
    entries: desired,
  }
}
