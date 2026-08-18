import {
  CODEX_PROVIDER_ID,
  type CodexAuthSnapshot,
  type CodexAuthState,
} from '../protocol.js'
import type { CodexLoginLocaleKey } from './locales.js'

export type AuthCopySurface = 'dock' | 'settings'

export interface DockSessionFacts {
  readonly providerId: string | null
  readonly isSubagent: boolean
  readonly dismissed: boolean
}

export type AuthPrimaryAction = 'login' | 'cancel' | 'logout'
export type AuthSecondaryAction = 'later'

export interface AuthCopy {
  readonly titleKey: CodexLoginLocaleKey
  readonly bodyKey: CodexLoginLocaleKey
  readonly footnoteKey?: CodexLoginLocaleKey
  readonly primary?: {
    readonly action: AuthPrimaryAction
    readonly labelKey: CodexLoginLocaleKey
  }
  readonly secondary?: {
    readonly action: AuthSecondaryAction
    readonly labelKey: CodexLoginLocaleKey
  }
  readonly errorCode?: string
  readonly errorMessage?: string
}

export function isCodexProvider(providerId: string | null): boolean {
  return providerId === CODEX_PROVIDER_ID
}

export function shouldBlockComposer(
  facts: Pick<DockSessionFacts, 'providerId' | 'isSubagent'>,
  snapshot: CodexAuthSnapshot | undefined,
): boolean {
  if (facts.isSubagent || !isCodexProvider(facts.providerId)) return false
  if (snapshot === undefined) return false
  return snapshot.state !== 'ready'
}

export function shouldRenderDock(
  facts: DockSessionFacts,
  snapshot: CodexAuthSnapshot | undefined,
): boolean {
  if (!shouldBlockComposer(facts, snapshot)) return false
  return !facts.dismissed
}

function withLater(copy: AuthCopy, surface: AuthCopySurface): AuthCopy {
  if (surface === 'settings') {
    const { secondary: _secondary, ...rest } = copy
    return rest
  }
  return copy
}

export function copyForAuthState(
  state: CodexAuthState,
  surface: AuthCopySurface = 'dock',
): AuthCopy {
  switch (state) {
    case 'authorizing':
      return withLater({
        titleKey: 'title.authorizing',
        bodyKey: surface === 'settings' ? 'body.authorizingSettings' : 'body.authorizing',
        footnoteKey: 'footnote.pkce',
        primary: { action: 'cancel', labelKey: 'action.cancel' },
      }, surface)
    case 'expired':
      return withLater({
        titleKey: 'title.expired',
        bodyKey: 'body.expired',
        footnoteKey: 'footnote.pkce',
        primary: { action: 'login', labelKey: 'action.retry' },
        secondary: { action: 'later', labelKey: 'action.later' },
      }, surface)
    case 'error':
      return withLater({
        titleKey: 'title.error',
        bodyKey: 'body.error',
        footnoteKey: 'footnote.pkce',
        primary: { action: 'login', labelKey: 'action.retry' },
        secondary: { action: 'later', labelKey: 'action.later' },
      }, surface)
    case 'missingPlugin':
      return withLater({
        titleKey: 'title.missingPlugin',
        bodyKey: 'body.missingPlugin',
        secondary: { action: 'later', labelKey: 'action.later' },
      }, surface)
    case 'ready':
      if (surface === 'settings') {
        return {
          titleKey: 'title.ready',
          bodyKey: 'body.ready',
          footnoteKey: 'footnote.pkce',
          primary: { action: 'logout', labelKey: 'action.logout' },
        }
      }
      return withLater({
        titleKey: 'title.signedOut',
        bodyKey: 'body.signedOut',
        footnoteKey: 'footnote.pkce',
        primary: { action: 'login', labelKey: 'action.login' },
        secondary: { action: 'later', labelKey: 'action.later' },
      }, surface)
    case 'signedOut':
      return withLater({
        titleKey: 'title.signedOut',
        bodyKey: 'body.signedOut',
        footnoteKey: 'footnote.pkce',
        primary: { action: 'login', labelKey: 'action.login' },
        secondary: { action: 'later', labelKey: 'action.later' },
      }, surface)
  }
}

export function copyForSnapshot(
  snapshot: CodexAuthSnapshot,
  surface: AuthCopySurface = 'dock',
): AuthCopy {
  const copy = copyForAuthState(snapshot.state, surface)
  return {
    ...copy,
    ...snapshot.errorCode === undefined ? {} : { errorCode: snapshot.errorCode },
    ...snapshot.errorMessage === undefined ? {} : { errorMessage: snapshot.errorMessage },
  }
}

export function composerBlockReason(translate: (key: CodexLoginLocaleKey) => string): string {
  return translate('block.reason')
}

export function overlayAuthorizing(snapshot: CodexAuthSnapshot | undefined): CodexAuthSnapshot {
  if (snapshot?.state === 'ready' || snapshot?.state === 'authorizing') return snapshot
  if (snapshot !== undefined) {
    return { ...snapshot, state: 'authorizing' }
  }
  return {
    state: 'authorizing',
    providerId: CODEX_PROVIDER_ID,
    oauthPluginPresent: true,
    credentialConfigured: false,
  }
}
