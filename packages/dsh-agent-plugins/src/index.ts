/**
 * dsh-agent-plugins host half.
 *
 * Agent Plugins 1.0.0 adapter for DeepSeek Harness. The plugin is a Cordis
 * service (extends TypertRemoteService) whose namespace `agentPlugins` is
 * exposed to the browser through the typert Gateway SRC reflection — the
 * panel client half calls `connection.rpc.call('/api', 'agentPlugins/<m>', { args })`.
 *
 * Milestone state (M0 skeleton):
 * - host service + remote endpoints exist (`ping` proves the channel);
 * - store watch / skills provider / MCP patch sync land in M1–M3.
 *
 * Not doing (guard rails, keep in mind while editing):
 * - no process sandbox for plugin stdio servers (spec has none; shell trust);
 * - no sse transport, no extensions directories, no per-tool allow/deny,
 *   no MCP approval integration;
 * - component-level toggles stop at skill / MCP server granularity.
 */
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'agent-plugins'

/** Host-side agent-plugins service key and Remote namespace. */
export const AGENT_PLUGINS_SERVICE = 'agentPlugins'

/** Version reported by the `ping` endpoint; keep in sync with package.json. */
const SERVICE_VERSION = '0.1.0'

/**
 * The agent-plugins adapter service.
 *
 * As a Cordis plugin class, Cordis instantiates it with (ctx, config);
 * the TypertRemoteService base registers the service and binds the
 * `agentPlugins` Remote namespace (default namespace = service key).
 */
export default class AgentPluginsService extends TypertRemoteService<never> {
  static inject: string[] = []

  constructor(ctx: Context) {
    super(ctx, AGENT_PLUGINS_SERVICE)
    // M1+: watch stores, register the skills provider, sync MCP patch rows.
  }

  /** Channel liveness probe used by the panel and by E2E tests. */
  @Remote('ping')
  async ping(): Promise<{ ok: true; service: string; version: string }> {
    return { ok: true, service: AGENT_PLUGINS_SERVICE, version: SERVICE_VERSION }
  }
}
