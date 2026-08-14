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
import { homedir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import type { SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { DATA_DIRNAME, STORE_DIRNAME, loadLedger, resolveDshHome, type Ledger } from './store.js'
import { AgentPluginsSkillProvider } from './skill-provider.js'
import { watchStoreTree } from './store-watch.js'
import { syncMcpRows } from './mcp-sync.js'

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
  }

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
}
