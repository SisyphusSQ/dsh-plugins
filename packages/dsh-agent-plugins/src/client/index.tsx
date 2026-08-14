/**
 * dsh-agent-plugins client half — "Agent Plugins" settings panel (M5).
 *
 * Mounts one page into the Plugins settings section (`settings.plugins.tab`)
 * and talks to the host half through the typert Gateway RPC channel:
 * `connection.rpc.call('/api', 'agentPlugins/<method>', { args })`.
 *
 * Panel scope (per the UI design decisions):
 * - read-only list + two-level enable toggles (plugin / skill / MCP server);
 * - install/uninstall/update stay CLI-only; no discovery tab (no market);
 * - cascade: plugin OFF greys out component toggles (states are preserved).
 */
import React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// Activate the client-side Context augmentations (ctx.locale, ctx.slots).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-runtime/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.plugins.tab': { kind: 'list'; scope: 'root' }
  }
  interface LocaleNamespaceMap {
    'agentPlugins.panel':
      | 'label'
      | 'empty'
      | 'emptyHint'
      | 'cliHint'
      | 'source'
      | 'skill'
      | 'mcp'
      | 'pluginState'
      | 'expand'
      | 'collapse'
      | 'storeDir'
      | 'dataDir'
      | 'installedAt'
      | 'loadError'
      | 'toggleError'
  }
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'agent-plugins'

/** Locale dictionary namespace owned by this client half. */
const NS = 'agentPlugins.panel'

/** Required client services (cordis fiber inject). */
export const inject = ['slots', 'connection', 'locale']

/** RPC result envelope (RpcResult<unknown>). */
interface RpcResultEnvelope {
  ok: boolean
  value?: unknown
  error?: { code?: string; message?: string }
}

/** Panel data mirroring the host `agentPlugins/list` projection. */
interface PanelPlugin {
  name: string
  version: string
  source: 'dir' | 'zip' | 'git' | null
  installedAt: string | null
  enabled: boolean
  description: string | null
  skills: Array<{ name: string; enabled: boolean }>
  mcp: Array<{ serverName: string; enabled: boolean }>
}

interface PanelData {
  plugins: PanelPlugin[]
  stores: string[]
  dataRoot: string
}

/** Business face injected into the panel component by the slot registration. */
export interface AgentPluginsPanelFace {
  list: () => Promise<unknown>
  setEnabled: (args: { name: string; skill?: string; mcp?: string; enabled: boolean }) => Promise<unknown>
}

/**
 * Mount the Agent Plugins panel as a tab inside the Plugins settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: Context): void {
  const { rpc } = ctx.get('connection') as ConnectionHandle
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, {
    zh: {
      label: 'Agent 插件',
      empty: '还没有安装任何 Agent 插件',
      emptyHint: '使用 CLI 安装一个插件包，然后回到这里管理它',
      cliHint: 'agent-plugins install <dir|zip|git-url>',
      source: '来源',
      skill: '技能',
      mcp: 'MCP',
      pluginState: '插件',
      expand: '展开详情',
      collapse: '收起',
      storeDir: 'Store 目录',
      dataDir: 'PLUGIN_DATA',
      installedAt: '安装时间',
      loadError: '加载失败',
      toggleError: '切换失败',
    },
    en: {
      label: 'Agent Plugins',
      empty: 'No agent plugins installed yet',
      emptyHint: 'Install a plugin package with the CLI, then manage it here',
      cliHint: 'agent-plugins install <dir|zip|git-url>',
      source: 'Source',
      skill: 'Skill',
      mcp: 'MCP',
      pluginState: 'Plugin',
      expand: 'Show details',
      collapse: 'Collapse',
      storeDir: 'Store',
      dataDir: 'PLUGIN_DATA',
      installedAt: 'Installed',
      loadError: 'Failed to load',
      toggleError: 'Failed to toggle',
    },
  }))
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'agent-plugins',
    order: 20,
    label: () => t('label'),
    locale: NS,
    inject: (): AgentPluginsPanelFace => ({
      list: async () => rpc.call('/api', 'agentPlugins/list', { args: {} }),
      setEnabled: async (args) => rpc.call('/api', 'agentPlugins/setEnabled', { args }),
    }),
  }, AgentPluginsPanel))
}

/** Panel component props: the injected business face plus the locale `t` seat. */
interface AgentPluginsPanelProps extends AgentPluginsPanelFace, PropsLocale<'agentPlugins.panel'> {}

/** Small inline stylesheet injected once (kept minimal, no external CSS). */
const css = `
.ap-panel{display:flex;flex-direction:column;gap:14px;max-width:720px}
.ap-empty{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:1.6}
.ap-cli{background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 12px;font-size:12px;line-height:1.5;margin:0}
.ap-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.ap-head{display:flex;align-items:center;gap:10px;min-width:0}
.ap-title{flex:1;min-width:0;font-size:13px;font-weight:600;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px}
.ap-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;margin:0}
.ap-desc{color:var(--dsw-alias-label-secondary);font-size:12px;margin:0;line-height:1.5}
.ap-row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.ap-row-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-switch{font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 10px;font-size:12px;cursor:pointer}
.ap-switch:disabled{opacity:.45;cursor:default}
.ap-divider{border:none;border-top:1px solid var(--dsw-alias-border-l2);margin:2px 0}
.ap-sub{display:flex;flex-direction:column;gap:6px;padding-left:2px}
.ap-sub-head{font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary);margin:0;text-transform:uppercase;letter-spacing:.04em}
.ap-detail{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;word-break:break-all;line-height:1.5}
.ap-error{color:var(--dsw-alias-label-error);font-size:12px;margin:0}
`

/** Inject the stylesheet once per page (idempotent). */
function ensureStyles(): void {
  const tag = 'dsh-agent-plugins-panel-css'
  if (typeof document !== 'undefined' && document.querySelector(`style[data-tag="${tag}"]`) === null) {
    const style = document.createElement('style')
    style.dataset.tag = tag
    style.textContent = css
    document.head.appendChild(style)
  }
}

/** Extract a value from an RPC result envelope. */
function rpcValue(result: unknown): { ok: true; value: PanelData } | { ok: false; message: string } {
  const envelope = result as RpcResultEnvelope
  if (envelope?.ok === true && envelope.value !== undefined) {
    return { ok: true, value: envelope.value as PanelData }
  }
  return { ok: false, message: envelope?.error?.message ?? String(result) }
}

/**
 * Panel body: installed plugin list with two-level toggles, MCP list inline,
 * CLI hint, and an empty state.
 */
function AgentPluginsPanel({ list, setEnabled, t }: AgentPluginsPanelProps) {
  const [data, setData] = React.useState<PanelData | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [toggleError, setToggleError] = React.useState<string | null>(null)

  React.useEffect(() => {
    ensureStyles()
    let cancelled = false
    void list().then((result) => {
      if (cancelled) return
      const parsed = rpcValue(result)
      if (parsed.ok) {
        setData(parsed.value)
        setError(null)
      } else {
        setError(parsed.message)
      }
    })
    return () => { cancelled = true }
  }, [list])

  const toggle = async (args: { name: string; skill?: string; mcp?: string; enabled: boolean }): Promise<void> => {
    setBusy(true)
    setToggleError(null)
    try {
      const result = rpcValue(await setEnabled(args))
      if (!result.ok) setToggleError(result.message)
      const fresh = rpcValue(await list())
      if (fresh.ok) {
        setData(fresh.value)
        setError(null)
      }
    } catch (err) {
      setToggleError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ap-panel">
      {error !== null && <p className="ap-error">{t('loadError')}: {error}</p>}
      {toggleError !== null && <p className="ap-error">{t('toggleError')}: {toggleError}</p>}
      {data !== null && data.plugins.length === 0 && (
        <>
          <p className="ap-empty">{t('empty')}</p>
          <p className="ap-empty">{t('emptyHint')}</p>
          <p className="ap-cli">{t('cliHint')}</p>
        </>
      )}
      {data?.plugins.map((plugin) => {
        const open = expanded === plugin.name
        return (
          <div className="ap-card" key={plugin.name}>
            <div className="ap-head">
              <p className="ap-title">{plugin.name}@{plugin.version}</p>
              {plugin.source !== null && <span className="ap-badge">{plugin.source}</span>}
              <button
                type="button"
                className="ap-switch"
                disabled={busy}
                onClick={() => void toggle({ name: plugin.name, enabled: !plugin.enabled })}
              >
                {plugin.enabled ? `${t('pluginState')} ✓` : `${t('pluginState')} ✗`}
              </button>
              <button
                type="button"
                className="ap-switch"
                onClick={() => setExpanded(open ? null : plugin.name)}
              >
                {open ? t('collapse') : t('expand')}
              </button>
            </div>
            {open && (
              <>
                {plugin.description !== null && <p className="ap-desc">{plugin.description}</p>}
                {plugin.installedAt !== null && <p className="ap-meta">{t('installedAt')}: {plugin.installedAt}</p>}
                <div className="ap-sub">
                  <p className="ap-sub-head">{t('skill')}</p>
                  {plugin.skills.length === 0 && <p className="ap-meta">—</p>}
                  {plugin.skills.map((skill) => (
                    <div className="ap-row" key={skill.name}>
                      <span className="ap-row-label">{skill.name}</span>
                      <button
                        type="button"
                        className="ap-switch"
                        disabled={busy || !plugin.enabled}
                        onClick={() => void toggle({ name: plugin.name, skill: skill.name, enabled: !skill.enabled })}
                      >
                        {skill.enabled ? '✓' : '✗'}
                      </button>
                    </div>
                  ))}
                </div>
                <hr className="ap-divider" />
                <div className="ap-sub">
                  <p className="ap-sub-head">{t('mcp')}</p>
                  {plugin.mcp.length === 0 && <p className="ap-meta">—</p>}
                  {plugin.mcp.map((server) => (
                    <div className="ap-row" key={server.serverName}>
                      <span className="ap-row-label">{server.serverName}</span>
                      <button
                        type="button"
                        className="ap-switch"
                        disabled={busy || !plugin.enabled}
                        onClick={() => void toggle({ name: plugin.name, mcp: server.serverName, enabled: !server.enabled })}
                      >
                        {server.enabled ? '✓' : '✗'}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="ap-detail">{t('dataDir')}: {data.dataRoot}/{plugin.name}</p>
              </>
            )}
          </div>
        )
      })}
      {data !== null && data.plugins.length > 0 && <p className="ap-cli">{t('cliHint')}</p>}
      {data !== null && (
        <p className="ap-meta">{t('storeDir')}: {data.stores.join(', ')}</p>
      )}
    </div>
  )
}
