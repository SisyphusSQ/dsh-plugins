/**
 * dsh-agent-plugins host half.
 *
 * Agent Plugins 1.0.0 adapter for DeepSeek Harness. The plugin is a Cordis
 * service (extends TypertRemoteService) whose namespace `agentPlugins` is
 * exposed to the browser through the typert Gateway SRC reflection — the
 * panel client half calls `connection.rpc.call('/api', 'agentPlugins/<m>', { args })`.
 *
 * Milestone state (M2):
 * - M0: host service + remote endpoints (`ping` proves the channel);
 * - M2: skills provider registered into `ctx.skills` (provider `agent-plugins`,
 *   rank 90), store watch drives `control.invalidate()` and ledger refresh;
 * - M1: CLI / store / ledger live in the same lib (lib/store.js etc.);
 * - M3: MCP mapping + home-patch sync; M5: panel data endpoints.
 *
 * Not doing (guard rails, keep in mind while editing):
 * - no process sandbox for plugin stdio servers (spec has none; shell trust);
 * - no sse transport, no extensions directories, no per-tool allow/deny,
 *   no MCP approval integration;
 * - component-level toggles stop at skill / MCP server granularity.
 */
import { access, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import type { SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { DATA_DIRNAME, STORE_DIRNAME, loadLedger, resolveDshHome, scanStore, setMcpEnabled, setPluginEnabled, setSkillEnabled, type Ledger, type LedgerPlugin, type StorePlugin } from './store.js'
import { AgentPluginsSkillProvider } from './skill-provider.js'
import { watchStoreTree } from './store-watch.js'
import { syncMcpRows } from './mcp-sync.js'
import { mapMcpServers, mcpRowId, type McpMappingContext } from './mcp-map.js'
import { parseMcpManifest } from './manifest.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'agent-plugins'

/** Host-side agent-plugins service key and Remote namespace. */
export const AGENT_PLUGINS_SERVICE = 'agentPlugins'

/** Version reported by the `ping` endpoint; keep in sync with package.json. */
const SERVICE_VERSION = '0.1.0'

/** Adapter configuration (see the config table in docs/design/dsh-agent-plugins.md). */
export interface AgentPluginsConfig {
  /** Machine-level store directories; default `$DSH_HOME/agent-plugins`. `~` expands to $HOME. */
  stores?: string[]
  /** Whether the skills half is enabled. */
  skillsEnabled?: boolean
  /** Whether the MCP half is enabled. */
  mcpEnabled?: boolean
  /** Home patch file receiving the generated MCP rows; default `$DSH_HOME/cordis.patch.yml`. */
  managedPatch?: string
}

/** Expand a leading `~` in configured paths. */
export function expandHome(value: string): string {
  return value === '~' ? homedir() : value.startsWith('~/') ? join(homedir(), value.slice(2)) : value
}

/**
 * The agent-plugins adapter service.
 *
 * As a Cordis plugin class, Cordis instantiates it with (ctx, config);
 * the TypertRemoteService base registers the service and binds the
 * `agentPlugins` Remote namespace (default namespace = service key).
 */
export default class AgentPluginsService extends TypertRemoteService<never> {
  static inject = ['skills']

  static Config = z.object({
    stores: z.array(z.string()).default([]),
    skillsEnabled: z.boolean().default(true),
    mcpEnabled: z.boolean().default(true),
    managedPatch: z.string().default(''),
  })

  private readonly provider: AgentPluginsSkillProvider
  private control: SkillProviderControl | undefined
  private ledger: Ledger

  constructor(ctx: Context, config: AgentPluginsConfig = {}) {
    super(ctx, AGENT_PLUGINS_SERVICE)
    const home = resolveDshHome()
    const stores = (config.stores ?? []).length > 0
      ? config.stores!.map(expandHome)
      : [join(home, STORE_DIRNAME)]
    const primaryStore = stores[0]
    const dataRoot = join(home, DATA_DIRNAME)
    const managedPatch = config.managedPatch !== undefined && config.managedPatch !== ''
      ? expandHome(config.managedPatch)
      : join(home, 'cordis.patch.yml')
    this.ledger = { version: 1, plugins: {} }

    this.provider = new AgentPluginsSkillProvider(ctx, {
      stores,
      readLedger: () => this.ledger,
      warn: (message) => ctx.logger.warn(message),
    })

    const skillsEnabled = config.skillsEnabled ?? true
    if (skillsEnabled) {
      ctx.effect(() => ctx.skills.registerProvider((control) => {
        this.control = control
        return this.provider
      }))
    }

    const mcpEnabled = config.mcpEnabled ?? true

    // Reconciliation: refresh the ledger, invalidate skill catalogs, and
    // rewrite the managed MCP rows. Runs once at apply() (full reconcile)
    // and on every store change (incremental; the watcher debounces).
    const reconcile = async (): Promise<void> => {
      if (primaryStore !== undefined) {
        const { ledger } = await loadLedger(primaryStore)
        this.ledger = ledger
      }
      this.control?.invalidate()
      if (mcpEnabled) {
        const result = await syncMcpRows({
          storeDirs: stores,
          dataRoot,
          managedPatch,
          readLedger: () => this.ledger,
          warn: (message) => ctx.logger.warn(message),
        })
        if (result.error !== undefined) ctx.logger.warn(`agent-plugins: MCP sync failed: ${result.error}`)
      }
    }
    void reconcile()

    const disposers = stores.map((store) => watchStoreTree(store, () => {
      void reconcile()
    }))
    ctx.effect(() => () => {
      for (const dispose of disposers) dispose()
    })

    // Keep the resolved runtime paths for the panel endpoints.
    this.stores = stores
    this.dataRoot = dataRoot
  }

  private stores: string[] = []
  private dataRoot = ''

  /** Channel liveness probe used by the panel and by E2E tests. */
  @Remote('ping')
  async ping(): Promise<{ ok: true; service: string; version: string }> {
    return { ok: true, service: AGENT_PLUGINS_SERVICE, version: SERVICE_VERSION }
  }

  /**
   * Skill catalog view (read-only) — used by the panel and M2 E2E checks.
   * Returns the registry's merged skill summaries for the global layer.
   */
  @Remote('skills')
  async skills(): Promise<{ skills: Array<{ name: string; description: string; provider: string }> }> {
    const summaries = await this.ctx.skills.list()
    return {
      skills: summaries.map((skill) => ({ name: skill.name, description: skill.description, provider: skill.provider })),
    }
  }

  /**
   * Panel data: installed plugins (machine + project stores) with two-level
   * enable states, component inventories, MCP transport/row ids, and the
   * store locations. Read-only.
   */
  @Remote('list')
  async list(): Promise<PanelData> {
    const ledger = this.ledger
    const plugins: PanelPlugin[] = []
    for (const storeDir of this.stores) {
      for (const plugin of await scanStore(storeDir)) {
        plugins.push(await this.panelPlugin(plugin, ledger))
      }
    }
    // Project-level stores contribute skills only (2026-08-14 decision).
    const projectPlugins: PanelPlugin[] = []
    const projectStore = await this.projectStoreDir()
    if (projectStore !== undefined) {
      for (const plugin of await scanStore(projectStore)) {
        projectPlugins.push(await this.panelPlugin(plugin, ledger, true))
      }
    }
    return {
      plugins,
      projectPlugins,
      projectStore: projectStore ?? null,
      stores: this.stores,
      dataRoot: this.dataRoot,
    }
  }

  /** Build one panel row from a scanned store plugin. */
  private async panelPlugin(plugin: StorePlugin, ledger: Ledger, projectOnly = false): Promise<PanelPlugin> {
    const row = ledger.plugins[plugin.name]
    return {
      name: plugin.name,
      version: plugin.version,
      source: row?.source.kind ?? null,
      sourcePath: row?.source.path ?? null,
      installedAt: row?.installedAt ?? null,
      checksum: row?.source.checksum ?? null,
      enabled: row?.enabled ?? true,
      description: plugin.manifest.description ?? null,
      author: plugin.manifest.author ?? null,
      skills: plugin.skills.map((name) => ({
        name,
        enabled: componentEnabledOf(row, 'skills', name),
      })),
      mcp: projectOnly ? [] : await this.mcpRows(plugin, row),
    }
  }

  /** MCP rows with transport and stable row id (all servers, regardless of state). */
  private async mcpRows(plugin: StorePlugin, row: LedgerPlugin | undefined): Promise<PanelMcpRow[]> {
    const rows: PanelMcpRow[] = []
    let text: string
    try {
      text = await readFile(join(plugin.dir, 'mcp.json'), 'utf8')
    } catch {
      return rows
    }
    const parsed = parseMcpManifest(text)
    if (!parsed.ok || parsed.value === undefined) return rows
    const mapping: McpMappingContext = {
      pluginName: plugin.name,
      pluginRoot: plugin.dir,
      pluginDataDir: join(this.dataRoot, plugin.name),
    }
    for (const server of parsed.value) {
      const { configs } = mapMcpServers(plugin.name, [server], mapping)
      const config = configs[0]
      if (config === undefined) continue
      rows.push({
        serverName: config.serverName,
        transport: config.transport,
        rowId: mcpRowId(plugin.name, server.name),
        enabled: componentEnabledOf(row, 'mcp', config.serverName),
      })
    }
    return rows
  }

  /** Project-level store: <first workspace cwd>/.agent-plugins, when present. */
  private async projectStoreDir(): Promise<string | undefined> {
    const workspaces = this.ctx.get('workspaceRegistry')
    if (workspaces === undefined) return undefined
    try {
      const list = await workspaces.list()
      const first = list[0]
      if (first === undefined) return undefined
      const candidate = join(first.path, '.agent-plugins')
      try {
        await access(candidate)
        return candidate
      } catch {
        return undefined
      }
    } catch {
      return undefined
    }
  }

  /**
   * Panel write path: plugin-level or component-level enable toggle.
   * Wire args mirror the method parameter names (SRC reflection): pass
   * `{ name, enabled }` for the plugin level, plus `skill` or `mcp` for the
   * component level. Missing optional fields are allowed by the gateway.
   * Writes the ledger (the store watcher then reconciles skills + MCP rows).
   */
  @Remote('setEnabled')
  async setEnabled(name: string, skill: string | undefined, mcp: string | undefined, enabled: boolean): Promise<{ ok: boolean; message?: string }> {
    const primary = this.stores[0]
    if (primary === undefined) return { ok: false, message: 'no store configured' }
    const { ledger } = await loadLedger(primary)
    this.ledger = ledger
    const wrap = (result: { ok: boolean; issue?: { message: string } }): { ok: boolean; message?: string } =>
      result.ok ? { ok: true } : { ok: false, ...(result.issue !== undefined ? { message: result.issue.message } : {}) }
    if (skill !== undefined) {
      return wrap(await setSkillEnabled(primary, ledger, name, skill, enabled))
    }
    if (mcp !== undefined) {
      return wrap(await setMcpEnabled(primary, ledger, name, mcp, enabled))
    }
    return wrap(await setPluginEnabled(primary, ledger, name, enabled))
  }
}

/** Component effective state (absent row/state = enabled). */
function componentEnabledOf(row: LedgerPlugin | undefined, kind: 'skills' | 'mcp', key: string): boolean {
  if (row === undefined || !row.enabled) return false
  const state = row[kind][key]
  return state?.enabled ?? true
}

export interface PanelMcpRow {
  serverName: string
  transport: 'stdio' | 'streamable-http'
  rowId: string
  enabled: boolean
}

export interface PanelPlugin {
  name: string
  version: string
  source: 'dir' | 'zip' | 'git' | null
  sourcePath: string | null
  installedAt: string | null
  checksum: string | null
  enabled: boolean
  description: string | null
  author: unknown
  skills: Array<{ name: string; enabled: boolean }>
  mcp: PanelMcpRow[]
}

export interface PanelData {
  plugins: PanelPlugin[]
  projectPlugins: PanelPlugin[]
  projectStore: string | null
  stores: string[]
  dataRoot: string
}
