import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { EditableField, SwitchField, createPageStore } from './store.js'
import type { CopyKey } from './locales.js'
import { pageStyles } from './styles.js'

export interface PageInjected { commit: (field: EditableField, value: string | boolean) => void; refresh: () => void }
export type PageProps = PropsRuntime<'settings.section'> & PropsStore<ReturnType<typeof createPageStore>> & PropsLocale<'suqingsq-codex-bridge'> & PageInjected
const importFields = ['instructions', 'skills', 'plugins', 'agents'] as const
const authorizationFields = ['connectMcp', 'executeHooks'] as const
const hints: Record<SwitchField, CopyKey> = {
  enabled: 'enabledHint', instructions: 'instructionsHint', skills: 'skillsHint', plugins: 'pluginsHint', agents: 'agentsHint', connectMcp: 'connectMcpHint', executeHooks: 'executeHooksHint',
}
const pluginStatuses = { enabled: 'pluginEnabled', disabled: 'pluginDisabled', unknown: 'pluginUnknown', ambiguous: 'pluginAmbiguous', invalid: 'pluginInvalid' } as const

export function Page({ t, useStore, commit, refresh }: PageProps) {
  const state = useStore(value => value)
  const config = state.config
  const disabled = config.status !== 'ready' || !config.writable || state.pending
  const catalog = config.status === 'ready' && state.catalogStatus === 'ready' ? state.catalog : undefined
  const reading = state.catalogStatus === 'loading'
  const switchRow = (field: SwitchField) => <label className="ch-row" key={field}>
    <span className="ch-copy">
      <span className="ch-label">{t(field)}</span>
      <span className="ch-muted" id={`codex-home-${field}-hint`}>{t(hints[field])}</span>
    </span>
    <input className="ch-switch" type="checkbox" role="switch" aria-label={t(field)} aria-describedby={`codex-home-${field}-hint`}
      disabled={disabled} checked={config.value?.[field] ?? false} onChange={event => {
        const value = event.currentTarget.checked
        event.currentTarget.checked = config.value?.[field] ?? false
        if (!disabled) commit(field, value)
      }} />
  </label>

  return <section className="dsh-codex-home-page" aria-label={t('title')}>
    <style>{pageStyles}</style>
    <h2>{t('title')}</h2>
    <p className="ch-muted">{t('introduction')}</p>

    <section className="ch-group" aria-labelledby="codex-home-bridge">
      <div className="ch-group-heading"><h3 id="codex-home-bridge">{t('bridge')}</h3></div>
      <div className="ch-rows">
        {switchRow('enabled')}
        <form className="ch-directory" onSubmit={event => {
          event.preventDefault()
          if (disabled) return
          const input = event.currentTarget.elements.namedItem('home') as HTMLInputElement
          const value = input.value.trim()
          if (!value) {
            input.setCustomValidity(t('homeRequired'))
            input.reportValidity()
            return
          }
          input.setCustomValidity('')
          input.value = config.value?.home ?? ''
          if (value !== config.value?.home) commit('home', value)
        }}>
          <label className="ch-label" htmlFor="codex-home-directory">{t('home')}</label>
          <div className="ch-directory-controls">
            <div className="ch-directory-field">
              <input id="codex-home-directory" name="home" type="text" key={config.value?.home ?? 'loading'} defaultValue={config.value?.home ?? ''}
                required pattern=".*\S.*" disabled={disabled} aria-describedby="codex-home-directory-hint" aria-errormessage="codex-home-directory-error"
                onInput={event => { event.currentTarget.setCustomValidity(''); event.currentTarget.removeAttribute('aria-invalid') }}
                onInvalid={event => { event.currentTarget.setCustomValidity(t('homeRequired')); event.currentTarget.setAttribute('aria-invalid', 'true') }} />
              <p className="ch-field-error" id="codex-home-directory-error">{t('homeRequired')}</p>
            </div>
            <button type="submit" disabled={disabled}>{t('saveHome')}</button>
          </div>
          <p className="ch-muted" id="codex-home-directory-hint">{t('homeHint')}</p>
        </form>
      </div>
      <div className="ch-notice" aria-live="polite">
        {config.status === 'loading' && <p className="ch-muted" role="status">{t('loading')}</p>}
        {(config.status === 'unavailable' || config.status === 'ready' && !config.writable) && <p className="ch-muted" role="status">{t('unavailable')}</p>}
        {state.pending && <p className="ch-muted" role="status">{t('saving')}</p>}
        {state.error && <p className="ch-error" role="alert">{t(state.error)}</p>}
      </div>
    </section>

    <section className="ch-group" aria-labelledby="codex-home-imports">
      <div className="ch-group-heading"><h3 id="codex-home-imports">{t('imports')}</h3></div>
      <div className="ch-rows">{importFields.map(switchRow)}</div>
    </section>

    <section className="ch-group" aria-labelledby="codex-home-authorization">
      <div className="ch-group-heading"><h3 id="codex-home-authorization">{t('authorization')}</h3></div>
      <div className="ch-rows">
        {authorizationFields.map(switchRow)}
        <p className="ch-muted ch-risk">{t('trust')}</p>
      </div>
    </section>

    <section className="ch-group" aria-labelledby="codex-home-diagnostics" aria-busy={reading}>
      <div className="ch-group-heading">
        <h3 id="codex-home-diagnostics">{t('diagnostics')}</h3>
        <button type="button" disabled={reading || config.status !== 'ready' || state.pending} onClick={refresh}>{t('refresh')}</button>
      </div>
      <div className="ch-diagnostics">
        {catalog ? <>
          <p className="ch-muted">{t('loaded')}</p>
          <dl className="ch-counts">
            <div><dt>{t('countSkills')}</dt><dd>{catalog.skills.length}</dd></div>
            <div><dt>{t('countPlugins')}</dt><dd>{catalog.plugins.length}</dd></div>
            <div><dt>{t('countAgents')}</dt><dd>{catalog.agents.length}</dd></div>
            <div><dt>{t('countMcp')}</dt><dd>{catalog.mcp.length}</dd></div>
            <div><dt>{t('countHooks')}</dt><dd>{catalog.hooks.length}</dd></div>
          </dl>
          <p className="ch-muted">{t('catalogScope')}</p>
          <div className="ch-scan">
            <p>{t('scannedAt')}: <time dateTime={catalog.scannedAt}>{catalog.scannedAt}</time></p>
            <p>{t('scannedHome')}: {catalog.home}</p>
          </div>
          <details>
            <summary>{t('pluginDetails')} ({catalog.plugins.length})</summary>
            {catalog.plugins.length ? <ul className="ch-list">{catalog.plugins.map(plugin => <li key={plugin.id}>
              <strong>{plugin.id}</strong>
              <p className="ch-muted">{t('pluginVersion')}: {plugin.version || '—'} · {t('pluginStatus')}: {t(pluginStatuses[plugin.status])}</p>
            </li>)}</ul> : <p className="ch-muted">{t('noPlugins')}</p>}
          </details>
          <details>
            <summary>{t('diagnosticDetails')} ({catalog.diagnostics.length})</summary>
            {catalog.diagnostics.length ? <ul className="ch-list">{catalog.diagnostics.map((diagnostic, index) => <li key={index}>
              <strong>{t(diagnostic.severity === 'error' ? 'error' : 'warning')} · {diagnostic.code}</strong>
              <p>{diagnostic.message}</p>
              <p className="ch-muted">{diagnostic.source}</p>
            </li>)}</ul> : <p className="ch-muted">{t('noDiagnostics')}</p>}
          </details>
        </> : <p className="ch-muted" role={state.catalogStatus === 'failed' ? 'alert' : 'status'}>
          {t(reading ? 'catalogLoading' : state.catalogStatus === 'failed' ? 'catalogFailed' : 'pending')}
        </p>}
      </div>
    </section>
  </section>
}
