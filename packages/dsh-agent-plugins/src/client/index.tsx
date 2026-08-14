/**
 * dsh-agent-plugins client half — "Agent Plugins" settings panel (M0 skeleton).
 *
 * Mounts one page into the Plugins settings section (`settings.plugins.tab`
 * list slot, declared by dsh-client-ui-settings-plugins) and talks to the
 * host half through the typert Gateway RPC channel:
 * `connection.rpc.call('/api', 'agentPlugins/<method>', { args })`.
 *
 * M0 scope: prove the mount point and the host→client channel end to end
 * (ping). M5 replaces the panel body with the full list + two-level toggles.
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
      | 'ping'
      | 'pingResult'
      | 'pingOk'
      | 'pingFail'
      | 'detail'
  }
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'agent-plugins'

/** Locale dictionary namespace owned by this client half. */
const NS = 'agentPlugins.panel'

/** Required client services (cordis fiber inject). */
export const inject = ['slots', 'connection', 'locale']

/** Business face injected into the panel component by the slot registration. */
export interface AgentPluginsPanelFace {
  /** Call the host `agentPlugins/ping` Remote endpoint. */
  ping: () => Promise<unknown>
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
      ping: '测试通道',
      pingResult: '通道测试',
      pingOk: '连接正常',
      pingFail: '连接失败',
      detail: '详情',
    },
    en: {
      label: 'Agent Plugins',
      ping: 'Ping channel',
      pingResult: 'Channel test',
      pingOk: 'connected',
      pingFail: 'failed',
      detail: 'Detail',
    },
  }))
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'agent-plugins',
    order: 20,
    label: () => t('label'),
    locale: NS,
    inject: (): AgentPluginsPanelFace => ({
      ping: async () => rpc.call('/api', 'agentPlugins/ping', { args: {} }),
    }),
  }, AgentPluginsPanel))
}

/** Panel component props: the injected business face plus the locale `t` seat. */
interface AgentPluginsPanelProps extends AgentPluginsPanelFace, PropsLocale<'agentPlugins.panel'> {}

/**
 * M0 panel body: a single channel-liveness probe that calls the host half.
 * M5 replaces this with the installed-plugins list and two-level toggles.
 */
function AgentPluginsPanel({ ping, t }: AgentPluginsPanelProps) {
  const [state, setState] = React.useState<'idle' | 'pending' | 'ok' | 'fail'>('idle')
  const [detail, setDetail] = React.useState('')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
      <p style={{ margin: 0, fontSize: 13 }}>
        {t('pingResult')}: {state === 'idle' ? '—' : state === 'pending' ? '…' : state === 'ok' ? t('pingOk') : t('pingFail')}
      </p>
      <button
        type="button"
        disabled={state === 'pending'}
        onClick={async () => {
          setState('pending')
          try {
            const result = await ping()
            setDetail(JSON.stringify(result))
            setState('ok')
          } catch (error) {
            setDetail(String(error))
            setState('fail')
          }
        }}
        style={{ width: 140, height: 30 }}
      >
        {t('ping')}
      </button>
      {detail !== '' && (
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {t('detail')}: {detail}
        </pre>
      )}
    </div>
  )
}
