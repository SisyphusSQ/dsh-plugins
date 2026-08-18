import type { JSX } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { CodexAuthSnapshot } from '../protocol.js'
import type { AuthCopy } from './auth-ui.js'
import type { CodexLoginLocaleKey } from './locales.js'
import css from './LoginDock.module.css'

function translate(
  t: TranslateNS<'codex-login-dock'>,
  key: CodexLoginLocaleKey,
  params?: Record<string, string>,
): string {
  return t(key, params)
}

export function AuthCard({
  snapshot,
  copy,
  t,
  primaryDisabled,
  onPrimary,
  onSecondary,
}: {
  snapshot: CodexAuthSnapshot
  copy: AuthCopy
  t: TranslateNS<'codex-login-dock'>
  primaryDisabled?: boolean
  onPrimary?: () => void
  onSecondary?: () => void
}): JSX.Element {
  const errorText = copy.errorMessage === undefined
    ? undefined
    : copy.errorCode === undefined
      ? copy.errorMessage
      : translate(t, 'error.withCode', { message: copy.errorMessage, code: copy.errorCode })

  return (
    <section className={css.card} data-codex-login-dock={snapshot.state}>
      <h2 className={css.title}>{translate(t, copy.titleKey)}</h2>
      <p className={css.body}>{translate(t, copy.bodyKey)}</p>
      {errorText !== undefined && <p className={css.error}>{errorText}</p>}
      <div className={css.actions}>
        {copy.primary !== undefined && (
          <button
            type="button"
            className={css.primary}
            disabled={primaryDisabled === true}
            onClick={onPrimary}
          >
            {translate(t, copy.primary.labelKey)}
          </button>
        )}
        {copy.secondary !== undefined && (
          <button
            type="button"
            className={css.secondary}
            onClick={onSecondary}
          >
            {translate(t, copy.secondary.labelKey)}
          </button>
        )}
      </div>
      {copy.footnoteKey !== undefined && (
        <p className={css.footnote}>{translate(t, copy.footnoteKey)}</p>
      )}
    </section>
  )
}
