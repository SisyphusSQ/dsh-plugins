/**
 * dsh-agent-plugins client half — "Agent Plugins" settings panel (M5, design-aligned).
 *
 * Implements the OpenPencil design (agent-memory/ideas/designs/agent-plugins-panel.op):
 * two-column overview (plugin list + MCP servers / CLI), filter box, plugin
 * cards with component-level toggles, cascade grey-out, machine + project
 * store sections, full CLI command block, and the designed empty state.
 *
 * Talks to the host half through the typert Gateway RPC channel:
 * `connection.rpc.call('/api', 'agentPlugins/<method>', { args })`.
 */
import React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// Activate the client-side Context augmentations (ctx.locale, ctx.slots).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-runtime/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar.footer.action': { kind: 'list'; scope: 'root'; owner: { wide: boolean } }
  }
  interface LocaleNamespaceMap {
    'agentPlugins.panel':
      | 'navLabel'
      | 'close'
      | 'label'
      | 'subtitle'
      | 'filterName'
      | 'filterSource'
      | 'all'
      | 'machineStore'
      | 'projectStore'
      | 'mcpServers'
      | 'mcpSubtitle'
      | 'cli'
      | 'empty'
      | 'emptyHint'
      | 'emptySupport'
      | 'cliInstall'
      | 'cliUpdate'
      | 'cliEnable'
      | 'cliUninstall'
      | 'cliList'
      | 'skills'
      | 'mcp'
      | 'source'
      | 'author'
      | 'installedAt'
      | 'checksum'
      | 'dataDir'
      | 'componentList'
      | 'expand'
      | 'collapse'
      | 'updateCmd'
      | 'uninstallCmd'
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

interface PanelMcpRow {
  serverName: string
  transport: 'stdio' | 'streamable-http'
  rowId: string
  enabled: boolean
}

interface PanelPlugin {
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

interface PanelData {
  plugins: PanelPlugin[]
  projectPlugins: PanelPlugin[]
  projectStore: string | null
  stores: string[]
  dataRoot: string
}

/** Business face injected into the panel component by the slot registration. */
export interface AgentPluginsPanelFace {
  list: () => Promise<unknown>
  setEnabled: (args: { name: string; skill?: string; mcp?: string; enabled: boolean }) => Promise<unknown>
}

/**
 * Mount the Agent Plugins panel: a sidebar-foot "插件" entry (beside
 * Settings, per the app-shell design frame) that opens the panel in a
 * floating layer (same pattern as the cordis-panel entry). The panel content
 * is the design-aligned two-column overview.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: Context): void {
  const { rpc } = ctx.get('connection') as ConnectionHandle
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, {
    zh: {
      navLabel: '插件',
      close: '关闭',
      label: 'Agent 插件',
      subtitle: '已装插件与 MCP servers · 安装 / 卸载 / 更新走 CLI',
      filterName: '筛选 name / 来源',
      filterSource: '来源',
      all: '全部',
      machineStore: '已装插件 · 机器级 store',
      projectStore: '项目级 store（仅技能）',
      mcpServers: 'MCP servers',
      mcpSubtitle: '可单独启停 · 插件禁用时全部停用',
      cli: '命令行',
      empty: '还没有安装插件',
      emptyHint: '通过 CLI 安装 Agent Plugins 标准插件包后，技能与 MCP 工具会出现在这里和对话控制台。',
      emptySupport: '支持 git 仓库、zip 包与本地目录 · 校验通过才入 store',
      cliInstall: 'install <dir|zip|git-url>',
      cliUpdate: 'update [name…|--all]',
      cliEnable: 'enable | disable <name>',
      cliUninstall: 'uninstall <name>',
      cliList: 'list · doctor',
      skills: '技能',
      mcp: 'MCP',
      source: '来源',
      author: '作者',
      installedAt: '安装时间',
      checksum: '校验和',
      dataDir: 'PLUGIN_DATA',
      componentList: '组件清单 · 可单独启停',
      expand: '展开详情',
      collapse: '收起',
      updateCmd: '$ agent-plugins update',
      uninstallCmd: '$ agent-plugins uninstall',
      loadError: '加载失败',
      toggleError: '切换失败',
    },
    en: {
      navLabel: 'Plugins',
      close: 'Close',
      label: 'Agent Plugins',
      subtitle: 'Installed plugins & MCP servers · install / uninstall / update via CLI',
      filterName: 'Filter name / source',
      filterSource: 'Source',
      all: 'All',
      machineStore: 'Installed · machine store',
      projectStore: 'Project store (skills only)',
      mcpServers: 'MCP servers',
      mcpSubtitle: 'Toggle individually · all stop when the plugin is disabled',
      cli: 'Command line',
      empty: 'No plugins installed yet',
      emptyHint: 'Install an Agent Plugins standard package via the CLI; skills and MCP tools appear here and in the conversation console.',
      emptySupport: 'Supports git repos, zip archives and local directories · validated before entering the store',
      cliInstall: 'install <dir|zip|git-url>',
      cliUpdate: 'update [name…|--all]',
      cliEnable: 'enable | disable <name>',
      cliUninstall: 'uninstall <name>',
      cliList: 'list · doctor',
      skills: 'Skills',
      mcp: 'MCP',
      source: 'Source',
      author: 'Author',
      installedAt: 'Installed',
      checksum: 'Checksum',
      dataDir: 'PLUGIN_DATA',
      componentList: 'Components · toggle individually',
      expand: 'Show details',
      collapse: 'Collapse',
      updateCmd: '$ agent-plugins update',
      uninstallCmd: '$ agent-plugins uninstall',
      loadError: 'Failed to load',
      toggleError: 'Failed to toggle',
    },
  }))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'agent-plugins',
    order: 10,
    locale: NS,
    inject: (): AgentPluginsPanelFace => ({
      list: async () => rpc.call('/api', 'agentPlugins/list', { args: {} }),
      setEnabled: async (args) => rpc.call('/api', 'agentPlugins/setEnabled', { args }),
    }),
  }, AgentPluginsFooterAction))
}

/** Footer-entry props: the sidebar column state plus the panel business face. */
interface AgentPluginsFooterActionProps extends AgentPluginsPanelFace, PropsLocale<'agentPlugins.panel'> {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
}

/**
 * Sidebar-foot "插件" entry: a button that toggles a floating panel hosting
 * the design-aligned AgentPluginsPanel (mirrors the cordis-panel pattern).
 */
function AgentPluginsFooterAction({ wide, list, setEnabled, t }: AgentPluginsFooterActionProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button
        type="button"
        className="ap-nav"
        data-wide={wide}
        aria-label={t('navLabel')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5 6.5h6M5 9.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {wide && <span className="ap-nav-label">{t('navLabel')}</span>}
      </button>
      {open && (
        <div className="ap-float" role="dialog" aria-label={t('navLabel')}>
          <div className="ap-float-head">
            <span className="ap-float-title">{t('navLabel')}</span>
            <button type="button" className="ap-float-close" aria-label={t('close')} onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <div className="ap-float-body">
            <AgentPluginsPanel list={list} setEnabled={setEnabled} t={t} />
          </div>
        </div>
      )}
    </>
  )
}

/** Panel component props: the injected business face plus the locale `t` seat. */
interface AgentPluginsPanelProps extends AgentPluginsPanelFace, PropsLocale<'agentPlugins.panel'> {}

/** Design tokens from the OpenPencil design (agent-plugins-panel.op). */
const css = `
.ap-panel{display:flex;flex-direction:column;gap:16px;max-width:1100px;padding:4px 0}
.ap-header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
.ap-title-row{display:flex;align-items:center;gap:10px}
.ap-title{margin:0;font-size:20px;font-weight:700;line-height:1.2}
.ap-badge{background:#EEF2FF;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600;color:#374151}
.ap-subtitle{margin:3px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.ap-filters{display:flex;align-items:center;gap:8px}
.ap-filter{background:#FFFFFF;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;height:34px;padding:0 12px;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:8px}
.ap-filter-input{border:none;background:transparent;font:inherit;font-size:12px;outline:none;min-width:120px;color:var(--dsw-alias-label-primary)}
.ap-filter-select{border:none;background:transparent;font:inherit;font-size:12px;outline:none;color:var(--dsw-alias-label-primary);cursor:pointer}
.ap-body{display:flex;gap:16px;align-items:flex-start}
.ap-left{flex:1;min-width:0;display:flex;flex-direction:column;gap:16px}
.ap-right{width:300px;flex-shrink:0;display:flex;flex-direction:column;gap:16px}
.ap-section-head{display:flex;align-items:baseline;gap:8px}
.ap-section-title{margin:0;font-size:13px;font-weight:600}
.ap-section-path{margin:0;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ap-card{background:#FFFFFF;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px}
.ap-card-head{display:flex;align-items:center;gap:12px;min-width:0}
.ap-icon{width:40px;height:40px;border-radius:10px;background:#F3F4F6;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#4B5563;flex-shrink:0}
.ap-id{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.ap-name-row{display:flex;align-items:center;gap:8px;min-width:0}
.ap-name{margin:0;font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-pill{border-radius:999px;padding:1px 10px;font-size:11px;font-weight:600;white-space:nowrap}
.ap-pill-version{background:#F3F4F6;color:#374151}
.ap-pill-dir{background:#F3F4F6;color:#374151}
.ap-pill-git{background:#ECFDF5;color:#065F46}
.ap-pill-zip{background:#FFF7ED;color:#9A3412}
.ap-meta-line{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-divider{border:none;border-top:1px solid #F3F4F6;margin:0}
.ap-desc{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.6}
.ap-meta-table{display:flex;flex-direction:column;gap:5px}
.ap-meta-row{display:flex;gap:10px;font-size:11px;line-height:1.6}
.ap-meta-key{color:var(--dsw-alias-label-tertiary);flex-shrink:0;width:76px}
.ap-meta-val{color:var(--dsw-alias-label-secondary);min-width:0;word-break:break-all}
.ap-comp-head{margin:0;font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary);text-transform:uppercase;letter-spacing:.04em}
.ap-comp{display:flex;flex-direction:column;gap:4px}
.ap-comp-row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);min-width:0}
.ap-comp-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-comp-sub{font-size:10px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-cli-cmds{display:flex;flex-direction:column;gap:4px;margin:0;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ap-box{background:#F9FAFB;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px}
.ap-empty{text-align:center;padding:40px 20px;display:flex;flex-direction:column;gap:8px;align-items:center}
.ap-empty-title{margin:0;font-size:18px;font-weight:700}
.ap-empty-text{margin:0;font-size:13px;color:var(--dsw-alias-label-secondary);max-width:420px;line-height:1.6}
.ap-error{color:var(--dsw-alias-label-error);font-size:12px;margin:0}
.ap-nav{width:100%;height:36px;color:var(--dsw-alias-label-primary);cursor:pointer;background:transparent;border:none;border-radius:8px;display:inline-flex;align-items:center;gap:8px;padding:0 8px;font-family:inherit;font-size:14px;overflow:hidden}
.ap-nav:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.ap-nav[data-active]{background:var(--dsw-alias-interactive-bg-hover)}
.ap-nav[data-wide=false]{width:36px;height:36px;border-radius:50%;justify-content:center;padding:0}
.ap-nav-label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}
.ap-float{z-index:30;position:fixed;bottom:128px;left:12px;width:560px;max-width:calc(100vw - 24px);max-height:60vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);border-radius:12px;box-shadow:var(--dsw-shadow-lv2);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.ap-float-head{flex:none;min-height:44px;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base)}
.ap-float-title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}
.ap-float-close{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:transparent;border:none;font-size:18px;line-height:1;padding:2px 6px;border-radius:6px}
.ap-float-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.ap-float-body{flex:1;min-height:0;overflow-y:auto;padding:12px}
.ap-float-body .ap-panel{container-type:inline-size;max-width:none}
@container (max-width: 700px) {
  .ap-body{flex-direction:column}
  .ap-right{width:100%}
}
`

/** Switch per the design: 36×21 track (on #4D6BFE / off #D1D5DB) + 17×17 knob. */
function Switch({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled ?? false}
      onClick={onClick}
      style={{
        width: 36,
        height: 21,
        borderRadius: 11,
        background: on ? '#4D6BFE' : '#D1D5DB',
        border: 'none',
        padding: 2,
        position: 'relative',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'block',
          width: 17,
          height: 17,
          borderRadius: 9,
          background: '#FFFFFF',
          position: 'absolute',
          top: 2,
          left: on ? 17 : 2,
          transition: 'left .12s ease',
        }}
      />
    </button>
  )
}

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

/** One plugin card: header (icon/name/version/source/meta/switch) + optional details. */
function PluginCard({
  plugin,
  expanded,
  busy,
  data,
  t,
  onTogglePlugin,
  onToggleSkill,
  onToggleMcp,
  onExpand,
}: {
  plugin: PanelPlugin
  expanded: boolean
  busy: boolean
  data: PanelData
  t: TranslateNS<'agentPlugins.panel'>
  onTogglePlugin: () => void
  onToggleSkill: (skill: string, enabled: boolean) => void
  onToggleMcp: (server: string, enabled: boolean) => void
  onExpand: () => void
}) {
  const sourcePill = plugin.source === null ? null : (
    <span className={`ap-pill ap-pill-${plugin.source}`}>{plugin.source}</span>
  )
  const meta = `${plugin.skills.length} skills · ${plugin.mcp.length} MCP${plugin.sourcePath !== null ? ` · ${plugin.sourcePath}` : ''}`
  const author = typeof plugin.author === 'string' && plugin.author.length > 0 ? plugin.author : typeof plugin.author === 'object' && plugin.author !== null && 'name' in plugin.author && typeof (plugin.author as { name?: unknown }).name === 'string'
    ? (plugin.author as { name: string }).name
    : null
  return (
    <div className="ap-card">
      <div className="ap-card-head">
        <div className="ap-icon">{plugin.name.slice(0, 1).toUpperCase()}</div>
        <div className="ap-id">
          <div className="ap-name-row">
            <p className="ap-name">{plugin.name}</p>
            <span className="ap-pill ap-pill-version">v{plugin.version}</span>
            {sourcePill}
          </div>
          <p className="ap-meta-line">{meta}</p>
        </div>
        <Switch on={plugin.enabled} disabled={busy} onClick={onTogglePlugin} />
        <button
          type="button"
          onClick={onExpand}
          style={{
            font: 'inherit',
            fontSize: 12,
            color: 'var(--dsw-alias-label-secondary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 0',
            flexShrink: 0,
          }}
        >
          {expanded ? t('collapse') : t('expand')}
        </button>
      </div>
      {expanded && (
        <>
          <hr className="ap-divider" />
          {plugin.description !== null && <p className="ap-desc">{plugin.description}</p>}
          <div className="ap-meta-table">
            {plugin.sourcePath !== null && (
              <div className="ap-meta-row"><span className="ap-meta-key">{t('source')}</span><span className="ap-meta-val">{plugin.sourcePath}</span></div>
            )}
            {author !== null && (
              <div className="ap-meta-row"><span className="ap-meta-key">{t('author')}</span><span className="ap-meta-val">{author}</span></div>
            )}
            {plugin.installedAt !== null && (
              <div className="ap-meta-row"><span className="ap-meta-key">{t('installedAt')}</span><span className="ap-meta-val">{plugin.installedAt}</span></div>
            )}
            {plugin.checksum !== null && (
              <div className="ap-meta-row"><span className="ap-meta-key">{t('checksum')}</span><span className="ap-meta-val">sha256:{plugin.checksum.slice(0, 8)}…</span></div>
            )}
            <div className="ap-meta-row"><span className="ap-meta-key">{t('dataDir')}</span><span className="ap-meta-val">{data.dataRoot}/{plugin.name}</span></div>
          </div>
          <div className="ap-comp">
            <p className="ap-comp-head">{t('componentList')}</p>
            {plugin.skills.map((skill) => (
              <div className="ap-comp-row" key={skill.name}>
                <span className="ap-comp-name">{skill.name}</span>
                <Switch on={skill.enabled} disabled={busy || !plugin.enabled} onClick={() => onToggleSkill(skill.name, !skill.enabled)} />
              </div>
            ))}
            {plugin.mcp.map((server) => (
              <div className="ap-comp-row" key={server.serverName}>
                <span className="ap-comp-name">{server.serverName}</span>
                <span className="ap-comp-sub">{server.transport}</span>
                <Switch on={server.enabled} disabled={busy || !plugin.enabled} onClick={() => onToggleMcp(server.serverName, !server.enabled)} />
              </div>
            ))}
          </div>
          <div className="ap-box">
            <p className="ap-cli-cmds">{t('updateCmd')} {plugin.name} · {t('uninstallCmd')} {plugin.name}</p>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Panel body (design-aligned): header + filter, two-column body with plugin
 * list (machine + project stores) and the MCP servers / CLI column, and the
 * designed empty state.
 */
function AgentPluginsPanel({ list, setEnabled, t }: AgentPluginsPanelProps) {
  const [data, setData] = React.useState<PanelData | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [toggleError, setToggleError] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState('')
  const [sourceFilter, setSourceFilter] = React.useState<'all' | 'dir' | 'zip' | 'git'>('all')

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

  const refresh = async (): Promise<void> => {
    const fresh = rpcValue(await list())
    if (fresh.ok) {
      setData(fresh.value)
      setError(null)
    }
  }

  const toggle = async (args: { name: string; skill?: string; mcp?: string; enabled: boolean }): Promise<void> => {
    setBusy(true)
    setToggleError(null)
    try {
      const result = rpcValue(await setEnabled(args))
      if (!result.ok) setToggleError(result.message)
      await refresh()
    } catch (err) {
      setToggleError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const matches = (plugin: PanelPlugin): boolean => {
    if (sourceFilter !== 'all' && plugin.source !== sourceFilter) return false
    if (filter !== '' && !plugin.name.includes(filter)) return false
    return true
  }

  const allMcp = data === null ? [] : [...data.plugins.flatMap((p) => p.mcp.map((m) => ({ ...m, plugin: p }))), ...data.projectPlugins.flatMap((p) => p.mcp.map((m) => ({ ...m, plugin: p })))]
  const machinePlugins = data?.plugins.filter(matches) ?? []
  const projectPlugins = data?.projectPlugins.filter(matches) ?? []

  return (
    <div className="ap-panel">
      <div className="ap-header">
        <div>
          <div className="ap-title-row">
            <p className="ap-title">插件</p>
            <span className="ap-badge">Agent Plugins</span>
          </div>
          <p className="ap-subtitle">{t('subtitle')}</p>
        </div>
        <div className="ap-filters">
          <label className="ap-filter">
            <input
              className="ap-filter-input"
              placeholder={t('filterName')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <label className="ap-filter">
            <select className="ap-filter-select" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as 'all' | 'dir' | 'zip' | 'git')}>
              <option value="all">{t('all')}</option>
              <option value="dir">dir</option>
              <option value="zip">zip</option>
              <option value="git">git</option>
            </select>
          </label>
        </div>
      </div>

      {error !== null && <p className="ap-error">{t('loadError')}: {error}</p>}
      {toggleError !== null && <p className="ap-error">{t('toggleError')}: {toggleError}</p>}

      {data !== null && data.plugins.length === 0 && data.projectPlugins.length === 0 && (
        <div className="ap-card ap-empty">
          <p className="ap-empty-title">{t('empty')}</p>
          <p className="ap-empty-text">{t('emptyHint')}</p>
          <div className="ap-box" style={{ marginTop: 8 }}>
            <p className="ap-cli-cmds">$ {t('cliInstall')}</p>
          </div>
          <p className="ap-empty-text">{t('emptySupport')}</p>
        </div>
      )}

      {data !== null && (data.plugins.length > 0 || data.projectPlugins.length > 0) && (
        <div className="ap-body">
          <div className="ap-left">
            {(machinePlugins.length > 0 || data.plugins.length > 0) && (
              <>
                <div className="ap-section-head">
                  <p className="ap-section-title">{t('machineStore')}</p>
                  {data.stores[0] !== undefined && <p className="ap-section-path">{data.stores[0]}</p>}
                </div>
                {machinePlugins.map((plugin) => (
                  <PluginCard
                    key={plugin.name}
                    plugin={plugin}
                    expanded={expanded === plugin.name}
                    busy={busy}
                    data={data}
                    t={t}
                    onTogglePlugin={() => void toggle({ name: plugin.name, enabled: !plugin.enabled })}
                    onToggleSkill={(skill, enabled) => void toggle({ name: plugin.name, skill, enabled })}
                    onToggleMcp={(mcp, enabled) => void toggle({ name: plugin.name, mcp, enabled })}
                    onExpand={() => setExpanded(expanded === plugin.name ? null : plugin.name)}
                  />
                ))}
                {machinePlugins.length === 0 && data.plugins.length > 0 && <p className="ap-meta-line">—</p>}
              </>
            )}
            {data.projectStore !== null && (
              <>
                <div className="ap-section-head">
                  <p className="ap-section-title">{t('projectStore')}</p>
                  <p className="ap-section-path">{data.projectStore}</p>
                </div>
                {projectPlugins.map((plugin) => (
                  <PluginCard
                    key={plugin.name}
                    plugin={plugin}
                    expanded={expanded === `project:${plugin.name}`}
                    busy={busy}
                    data={data}
                    t={t}
                    onTogglePlugin={() => void toggle({ name: plugin.name, enabled: !plugin.enabled })}
                    onToggleSkill={(skill, enabled) => void toggle({ name: plugin.name, skill, enabled })}
                    onToggleMcp={() => undefined}
                    onExpand={() => setExpanded(expanded === `project:${plugin.name}` ? null : `project:${plugin.name}`)}
                  />
                ))}
              </>
            )}
          </div>

          <div className="ap-right">
            <div className="ap-card">
              <div>
                <p className="ap-section-title">{t('mcpServers')}</p>
                <p className="ap-subtitle">{t('mcpSubtitle')}</p>
              </div>
              <hr className="ap-divider" />
              {allMcp.length === 0 && <p className="ap-meta-line">—</p>}
              {allMcp.map((row) => (
                <div className="ap-comp-row" key={row.rowId}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ap-comp-name" style={{ fontSize: 12, fontWeight: 600 }}>{row.serverName}</div>
                    <div className="ap-comp-sub">{row.plugin.name} · {row.transport} · {row.rowId}</div>
                  </div>
                  <Switch
                    on={row.enabled}
                    disabled={busy || !row.plugin.enabled}
                    onClick={() => void toggle({ name: row.plugin.name, mcp: row.serverName, enabled: !row.enabled })}
                  />
                </div>
              ))}
            </div>
            <div className="ap-card">
              <p className="ap-section-title">{t('cli')}</p>
              <div className="ap-box">
                <p className="ap-cli-cmds">
                  $ {t('cliInstall')}<br />$ {t('cliUpdate')}<br />$ {t('cliEnable')}<br />$ {t('cliUninstall')}<br />$ {t('cliList')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
