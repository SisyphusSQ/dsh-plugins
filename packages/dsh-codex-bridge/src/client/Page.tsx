import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { EditableField, SwitchField, createPageStore } from './store.js'

export interface PageInjected { commit: (field: EditableField, value: string | boolean) => void; refresh: () => void }
export type PageProps = PropsRuntime<'settings.section'> & PropsStore<ReturnType<typeof createPageStore>> & PropsLocale<'suqingsq-codex-bridge'> & PageInjected
const switches: readonly SwitchField[] = ['enabled', 'instructions', 'skills', 'plugins', 'agents', 'connectMcp', 'executeHooks']

export function Page({ t, useStore, commit, refresh }: PageProps) {
  const state = useStore(value => value)
  const config = state.config
  const disabled = config.status !== 'ready' || !config.writable || state.pending
  return <section style={{ maxWidth: 760, padding: 16, color: 'var(--dsw-alias-label-primary)' }}>
    <h2>{t('title')}</h2>
    <p>{t('introduction')}</p>
    {config.status === 'loading' && <p role="status">{t('loading')}</p>}
    {(config.status === 'unavailable' || config.status === 'ready' && !config.writable) && <p role="status">{t('unavailable')}</p>}
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, display: 'grid', gap: 12 }}>
      <label style={{ display: 'grid', gap: 6 }}>{t('home')}
        <input key={config.value?.home ?? 'loading'} type="text" defaultValue={config.value?.home ?? ''} onBlur={event => {
          const value = event.currentTarget.value.trim()
          event.currentTarget.value = config.value?.home ?? ''
          if (value && value !== config.value?.home) commit('home', value)
        }} />
      </label>
      {switches.map(field => <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={config.value?.[field] ?? false} onChange={event => commit(field, event.currentTarget.checked)} />
        {t(field)}
      </label>)}
    </fieldset>
    <p style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{t('trust')}</p>
    {state.pending && <p role="status">{t('saving')}</p>}
    {state.error && <p role="alert">{t(state.error)}</p>}
    <h3>{t('diagnostics')}</h3>
    <button type="button" onClick={refresh}>{t('refresh')}</button>
    {state.catalog ? <>
      <p>{t('loaded')}: Skills {state.catalog.skills.length} · Plugins {state.catalog.plugins.length} · Agents {state.catalog.agents.length} · MCP {state.catalog.mcp.length} · Hooks {state.catalog.hooks.length}</p>
      <ul>{state.catalog.plugins.map(plugin => <li key={plugin.id}>{plugin.id}: {plugin.status}</li>)}</ul>
      <ul>{state.catalog.diagnostics.map((diagnostic, index) => <li key={index}>{diagnostic.code}: {diagnostic.message}</li>)}</ul>
    </> : <p role="status">{t('pending')}</p>}
  </section>
}
