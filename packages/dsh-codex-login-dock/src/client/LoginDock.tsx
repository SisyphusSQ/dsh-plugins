import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { CodexAuthSnapshot } from '../protocol.js'
import type { CodexAuthClient } from './api.js'
import { AuthCard } from './AuthCard.js'
import {
  composerBlockReason,
  copyForSnapshot,
  overlayAuthorizing,
  shouldBlockComposer,
  shouldRenderDock,
} from './auth-ui.js'
import type { CodexLoginLocaleKey } from './locales.js'
import css from './LoginDock.module.css'
import { currentProviderOf, type ModelDirectoriesFace } from './model.js'

type ComposerBlocks = IConversation['blocks']

export interface LoginDockDeps {
  readonly api: CodexAuthClient
  readonly directories: ModelDirectoriesFace
  readonly blocks: ComposerBlocks
  readonly onAuthChange?: (listener: () => void) => () => void
}

export type LoginDockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'codex-login-dock'>

function translate(
  t: TranslateNS<'codex-login-dock'>,
  key: CodexLoginLocaleKey,
): string {
  return t(key)
}

function useDirectoryProvider(directories: ModelDirectoriesFace, sessionId: SessionId): string | null {
  const directory = useMemo(() => {
    try {
      return directories.directoryFor(sessionId)
    } catch {
      return undefined
    }
  }, [directories, sessionId])

  useEffect(() => {
    if (directory === undefined) return
    void directory.load().catch(() => undefined)
  }, [directory])

  return useSyncExternalStore(
    (onStoreChange) => {
      if (directory === undefined) return () => undefined
      return directory.store.subscribe(onStoreChange)
    },
    () => directory === undefined ? null : currentProviderOf(directory),
  )
}

export function LoginDockSession({
  sessionId,
  isSubagent,
  t,
  deps,
}: {
  sessionId: SessionId
  isSubagent: boolean
  t: TranslateNS<'codex-login-dock'>
  deps: LoginDockDeps
}): JSX.Element | null {
  const providerId = useDirectoryProvider(deps.directories, sessionId)
  const [snapshot, setSnapshot] = useState<CodexAuthSnapshot | undefined>(undefined)
  const [dismissed, setDismissed] = useState(false)
  const [loginPending, setLoginPending] = useState(false)

  const loadStatus = useCallback((): void => {
    void deps.api.status(String(sessionId)).then(setSnapshot).catch(() => undefined)
  }, [deps.api, sessionId])

  useEffect(() => {
    setDismissed(false)
    setLoginPending(false)
    loadStatus()
  }, [sessionId, providerId, loadStatus])

  useEffect(() => {
    if (deps.onAuthChange === undefined) return undefined
    return deps.onAuthChange(() => {
      loadStatus()
    })
  }, [deps, loadStatus])

  const visibleSnapshot = loginPending
    ? overlayAuthorizing(snapshot)
    : snapshot

  const facts = {
    providerId,
    isSubagent,
    dismissed,
  }
  const blocked = shouldBlockComposer(facts, visibleSnapshot)
  const visible = shouldRenderDock(facts, visibleSnapshot)

  useEffect(() => {
    deps.blocks.set(
      sessionId,
      blocked ? { reason: composerBlockReason((key) => translate(t, key)) } : undefined,
    )
  }, [blocked, deps.blocks, sessionId, t])

  if (!visible || visibleSnapshot === undefined) return null

  const copy = copyForSnapshot(visibleSnapshot, 'dock')

  const onPrimary = (): void => {
    if (copy.primary?.action === 'cancel') {
      setLoginPending(false)
      void deps.api.cancel(String(sessionId)).then(setSnapshot).catch(() => undefined)
      return
    }
    setDismissed(false)
    setLoginPending(true)
    void deps.api.login(String(sessionId)).then((next) => {
      setSnapshot(next)
      setLoginPending(false)
    }).catch(() => {
      setLoginPending(false)
    })
  }

  return (
    <div className={css.dock}>
      <AuthCard
        snapshot={visibleSnapshot}
        copy={copy}
        t={t}
        primaryDisabled={loginPending && copy.primary?.action === 'login'}
        onPrimary={onPrimary}
        onSecondary={() => {
          setDismissed(true)
        }}
      />
    </div>
  )
}

export function createLoginDock(deps: LoginDockDeps) {
  return function LoginDock({ sessionId, session, t }: LoginDockProps): JSX.Element | null {
    return (
      <LoginDockSession
        sessionId={sessionId}
        isSubagent={session.subagent !== null}
        t={t}
        deps={deps}
      />
    )
  }
}
