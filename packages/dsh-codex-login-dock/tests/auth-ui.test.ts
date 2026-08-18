import { describe, expect, it } from 'vitest'
import { CODEX_PROVIDER_ID, parseAuthSnapshot } from '../src/protocol.js'
import {
  copyForSnapshot,
  shouldBlockComposer,
  shouldRenderDock,
} from '../src/client/auth-ui.js'
import type { CodexAuthSnapshot } from '../src/protocol.js'

const signedOut: CodexAuthSnapshot = {
  state: 'signedOut',
  providerId: CODEX_PROVIDER_ID,
  oauthPluginPresent: true,
  credentialConfigured: false,
}

const ready: CodexAuthSnapshot = {
  state: 'ready',
  providerId: CODEX_PROVIDER_ID,
  oauthPluginPresent: true,
  credentialConfigured: true,
}

const expired: CodexAuthSnapshot = {
  state: 'expired',
  providerId: CODEX_PROVIDER_ID,
  oauthPluginPresent: true,
  credentialConfigured: true,
  errorCode: 'AUTH_EXPIRED',
  errorMessage: '登录已过期，请重新登录。',
}

const missingPlugin: CodexAuthSnapshot = {
  state: 'missingPlugin',
  providerId: CODEX_PROVIDER_ID,
  oauthPluginPresent: false,
  credentialConfigured: false,
  errorCode: 'OAUTH_PLUGIN_MISSING',
  errorMessage: '未安装 dsh-openai-codex-oauth，无法登录 Codex 订阅。',
}

describe('dock visibility and composer block', () => {
  it('shows the card and blocks send only for openai-codex when not ready', () => {
    const facts = { providerId: CODEX_PROVIDER_ID, isSubagent: false, dismissed: false }
    expect(shouldRenderDock(facts, signedOut)).toBe(true)
    expect(shouldBlockComposer(facts, signedOut)).toBe(true)
    expect(shouldRenderDock(facts, ready)).toBe(false)
    expect(shouldBlockComposer(facts, ready)).toBe(false)
    expect(shouldRenderDock(facts, expired)).toBe(true)
    const dismissed = { ...facts, dismissed: true }
    expect(shouldRenderDock(dismissed, signedOut)).toBe(false)
    expect(shouldBlockComposer(dismissed, signedOut)).toBe(true)
  })

  it('hides the dock and unblocks when the provider is not Codex or the session is a subagent', () => {
    expect(shouldRenderDock({ providerId: 'deepseek', isSubagent: false, dismissed: false }, signedOut)).toBe(false)
    expect(shouldBlockComposer({ providerId: 'deepseek', isSubagent: false }, signedOut)).toBe(false)
    expect(shouldRenderDock({ providerId: CODEX_PROVIDER_ID, isSubagent: true, dismissed: false }, signedOut)).toBe(false)
    expect(shouldBlockComposer({ providerId: CODEX_PROVIDER_ID, isSubagent: true }, signedOut)).toBe(false)
    expect(shouldBlockComposer({ providerId: CODEX_PROVIDER_ID, isSubagent: false }, undefined)).toBe(false)
  })

  it('keeps missingPlugin visible without a login button', () => {
    const copy = copyForSnapshot(missingPlugin)
    expect(copy.titleKey).toBe('title.missingPlugin')
    expect(copy.primary).toBeUndefined()
    expect(copy.secondary?.action).toBe('later')
    expect(copy.errorCode).toBe('OAUTH_PLUGIN_MISSING')
  })

  it('uses cancel copy while authorizing and retry copy when expired', () => {
    expect(copyForSnapshot({ ...signedOut, state: 'authorizing' }).primary).toEqual({
      action: 'cancel',
      labelKey: 'action.cancel',
    })
    expect(copyForSnapshot(expired).primary).toEqual({
      action: 'login',
      labelKey: 'action.retry',
    })
  })

  it('keeps Connected copy and a logout action on the settings page', () => {
    const readyCopy = copyForSnapshot(ready, 'settings')
    expect(readyCopy.titleKey).toBe('title.ready')
    expect(readyCopy.primary).toEqual({
      action: 'logout',
      labelKey: 'action.logout',
    })
    expect(readyCopy.secondary).toBeUndefined()
    expect(copyForSnapshot(signedOut, 'settings').secondary).toBeUndefined()
    expect(copyForSnapshot({ ...signedOut, state: 'authorizing' }, 'settings').bodyKey).toBe(
      'body.authorizingSettings',
    )
  })
})

describe('parseAuthSnapshot', () => {
  it('drops unknown token fields', () => {
    const snapshot = parseAuthSnapshot({
      ...ready,
      access: 'test-access-token-aaa-secret',
    })
    expect(snapshot?.state).toBe('ready')
    expect(JSON.stringify(snapshot)).not.toContain('test-access-token-aaa-secret')
  })
})
