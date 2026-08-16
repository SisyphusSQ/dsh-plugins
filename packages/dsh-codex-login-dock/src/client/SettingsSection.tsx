import { useCallback, useEffect, useState, type JSX } from 'react'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  SESSION_UNAVAILABLE_MESSAGE,
  unavailableSessionSnapshot,
  type CodexAuthSnapshot,
} from '../protocol.js'
import type { CodexAuthClient } from './api.js'
import { AuthCard } from './AuthCard.js'
import { copyForSnapshot, overlayAuthorizing } from './auth-ui.js'
import css from './LoginDock.module.css'

export interface SettingsSectionDeps {
  readonly api: CodexAuthClient
  readonly onAuthChange?: (listener: () => void) => () => void
}

export type SettingsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'codex-login-dock'>

export function SettingsSectionView({
  sessionId,
  t,
  deps,
}: {
  sessionId: string
  t: TranslateNS<'codex-login-dock'>
  deps: SettingsSectionDeps
}): JSX.Element {
  const [snapshot, setSnapshot] = useState<CodexAuthSnapshot | undefined>(undefined)
  const [loginPending, setLoginPending] = useState(false)
  const [logoutPending, setLogoutPending] = useState(false)

  const loadStatus = useCallback((): void => {
    void deps.api.status(sessionId).then(setSnapshot).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : SESSION_UNAVAILABLE_MESSAGE
      setSnapshot(unavailableSessionSnapshot(message))
    })
  }, [deps.api, sessionId])

  useEffect(() => {
    setLoginPending(false)
    setLogoutPending(false)
    loadStatus()
  }, [sessionId, loadStatus])

  useEffect(() => {
    if (deps.onAuthChange === undefined) return undefined
    return deps.onAuthChange(() => {
      loadStatus()
    })
  }, [deps, loadStatus])

  const visibleSnapshot = loginPending
    ? overlayAuthorizing(snapshot)
    : snapshot
  const copy = visibleSnapshot === undefined
    ? undefined
    : copyForSnapshot(visibleSnapshot, 'settings')

  const onPrimary = (): void => {
    if (copy?.primary?.action === 'cancel') {
      setLoginPending(false)
      void deps.api.cancel(sessionId).then(setSnapshot).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : SESSION_UNAVAILABLE_MESSAGE
        setSnapshot(unavailableSessionSnapshot(message))
      })
      return
    }
    if (copy?.primary?.action === 'logout') {
      setLogoutPending(true)
      void deps.api.logout(sessionId).then((next) => {
        setSnapshot(next)
        setLogoutPending(false)
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : SESSION_UNAVAILABLE_MESSAGE
        setSnapshot(unavailableSessionSnapshot(message))
        setLogoutPending(false)
      })
      return
    }
    setLoginPending(true)
    void deps.api.login(sessionId).then((next) => {
      setSnapshot(next)
      setLoginPending(false)
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : SESSION_UNAVAILABLE_MESSAGE
      setSnapshot(unavailableSessionSnapshot(message))
      setLoginPending(false)
    })
  }

  return (
    <div className={css.page}>
      <p className={css.intro}>{t('settings.intro')}</p>
      {visibleSnapshot !== undefined && copy !== undefined && (
        <AuthCard
          snapshot={visibleSnapshot}
          copy={copy}
          t={t}
          primaryDisabled={
            (loginPending && copy.primary?.action === 'login')
            || (logoutPending && copy.primary?.action === 'logout')
          }
          onPrimary={onPrimary}
        />
      )}
    </div>
  )
}

export function createSettingsSection(deps: SettingsSectionDeps) {
  return function SettingsSection({ t, useSessions }: SettingsSectionProps): JSX.Element {
    const current = useSessions((list) => list.current)
    return (
      <SettingsSectionView
        sessionId={current ?? ''}
        t={t}
        deps={deps}
      />
    )
  }
}
