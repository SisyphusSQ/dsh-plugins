import type { CommandDefinition, CommandResult } from '@deepseek-ai/dsh-commands'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'

import {
  CODEX_PROVIDER_ID,
  formatAuthSnapshot,
  mapLoginFailure,
  type CodexAuthSnapshot,
} from './protocol.js'
import { readCodexAuthStatus, type CredentialStore } from './status.js'

export interface CodexOAuthSilent {
  loginBrowser(signal?: AbortSignal): Promise<void>
  logout(): Promise<void>
}

export interface CodexLoginDockHostOptions {
  readonly credentials: CredentialStore
  readonly oauthCredentialRef: CredentialRef
  readonly accessTokenRef: CredentialRef
  readonly getOAuth: () => CodexOAuthSilent | undefined
}

export interface CodexLoginDockHost {
  status(): Promise<CodexAuthSnapshot>
  startBrowserLogin(signal?: AbortSignal): Promise<CodexAuthSnapshot>
  logout(): Promise<CodexAuthSnapshot>
  cancelLogin(): Promise<CodexAuthSnapshot>
  commands(): readonly CommandDefinition[]
}

function cancelledSnapshot(snapshot: CodexAuthSnapshot): CodexAuthSnapshot {
  if (snapshot.state === 'ready' || snapshot.state === 'missingPlugin') return snapshot
  return {
    providerId: snapshot.providerId,
    oauthPluginPresent: snapshot.oauthPluginPresent,
    credentialConfigured: snapshot.credentialConfigured,
    state: snapshot.state === 'error' ? 'error' : 'signedOut',
    errorCode: 'LOGIN_CANCELLED',
    errorMessage: '浏览器登录已取消。',
    ...snapshot.expiresAt === undefined ? {} : { expiresAt: snapshot.expiresAt },
    ...snapshot.credentialSource === undefined ? {} : { credentialSource: snapshot.credentialSource },
  }
}

export function createCodexLoginDockHost(
  options: CodexLoginDockHostOptions,
): CodexLoginDockHost {
  let authorizing = false
  let loginAbort: AbortController | undefined

  const oauthPluginPresent = (): boolean => options.getOAuth() !== undefined

  const readStatus = (authorizingOverride?: boolean): Promise<CodexAuthSnapshot> => (
    readCodexAuthStatus({
      credentials: options.credentials,
      oauthCredentialRef: options.oauthCredentialRef,
      accessTokenRef: options.accessTokenRef,
      oauthPluginPresent: oauthPluginPresent(),
      ...authorizingOverride === undefined ? {} : { authorizing: authorizingOverride },
    })
  )

  const status = async (): Promise<CodexAuthSnapshot> => readStatus(authorizing)

  const cancelLogin = async (): Promise<CodexAuthSnapshot> => {
    loginAbort?.abort(new Error('login cancelled'))
    return cancelledSnapshot(await readStatus(false))
  }

  const startBrowserLogin = async (signal?: AbortSignal): Promise<CodexAuthSnapshot> => {
    const oauth = options.getOAuth()
    if (oauth === undefined) return readStatus(false)
    if (authorizing) {
      return {
        ...(await readStatus(true)),
        state: 'error',
        errorCode: 'LOGIN_IN_PROGRESS',
        errorMessage: '另一个浏览器登录正在进行。',
      }
    }

    authorizing = true
    const controller = new AbortController()
    loginAbort = controller
    const combined = signal === undefined
      ? controller.signal
      : AbortSignal.any([controller.signal, signal])
    try {
      await (combined.aborted
        ? Promise.reject(new Error('login cancelled'))
        : oauth.loginBrowser(combined))
      return await readStatus(false)
    } catch (error: unknown) {
      if (combined.aborted) {
        return cancelledSnapshot(await readStatus(false))
      }
      const text = error instanceof Error ? error.message : '浏览器登录失败，请重试。'
      const mapped = mapLoginFailure(text)
      return {
        state: mapped.code === 'AUTH_EXPIRED' ? 'expired' : 'error',
        providerId: CODEX_PROVIDER_ID,
        oauthPluginPresent: true,
        credentialConfigured: false,
        errorCode: mapped.code,
        errorMessage: mapped.message,
      }
    } finally {
      authorizing = false
      if (loginAbort === controller) loginAbort = undefined
    }
  }

  const logout = async (): Promise<CodexAuthSnapshot> => {
    const oauth = options.getOAuth()
    if (oauth === undefined) return readStatus(false)
    if (authorizing) {
      return {
        ...(await readStatus(true)),
        state: 'error',
        errorCode: 'LOGIN_IN_PROGRESS',
        errorMessage: '另一个浏览器登录正在进行。',
      }
    }
    try {
      await oauth.logout()
      return await readStatus(false)
    } catch (error: unknown) {
      const text = error instanceof Error ? error.message : '退出登录失败，请重试。'
      const mapped = mapLoginFailure(text)
      return {
        state: 'error',
        providerId: CODEX_PROVIDER_ID,
        oauthPluginPresent: true,
        credentialConfigured: true,
        errorCode: mapped.code,
        errorMessage: mapped.code === 'LOGIN_FAILED' ? '退出登录失败，请重试。' : mapped.message,
      }
    }
  }

  const commandResult = (snapshot: CodexAuthSnapshot): CommandResult => {
    if (
      snapshot.state === 'error'
      || snapshot.state === 'missingPlugin'
      || snapshot.state === 'expired'
      || snapshot.errorCode !== undefined
    ) {
      return { kind: 'error', text: formatAuthSnapshot(snapshot) }
    }
    return { kind: 'success', text: formatAuthSnapshot(snapshot) }
  }

  const commands = (): readonly CommandDefinition[] => [
    {
      name: 'codex-auth-status',
      description: '查看 Codex 订阅登录状态（不含凭据）',
      handler: async () => commandResult(await status()),
    },
    {
      name: 'codex-auth-login',
      description: '通过已安装的 OAuth 插件启动浏览器 PKCE 登录',
      handler: async (invocation) => commandResult(await startBrowserLogin(invocation.signal)),
    },
    {
      name: 'codex-auth-cancel',
      description: '取消进行中的 Codex 订阅浏览器登录',
      handler: async () => commandResult(await cancelLogin()),
    },
    {
      name: 'codex-auth-logout',
      description: '通过已安装的 OAuth 插件退出 Codex 订阅登录',
      handler: async () => commandResult(await logout()),
    },
  ]

  return {
    status,
    startBrowserLogin,
    logout,
    cancelLogin,
    commands,
  }
}
