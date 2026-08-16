import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandDefinition, CommandExecution, CommandResult } from '@deepseek-ai/dsh-commands'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'

import {
  CODEX_PROVIDER_ID,
  DEFAULT_LOGIN_LINE,
  DEFAULT_LOGOUT_LINE,
  formatAuthSnapshot,
  mapLoginFailure,
  type CodexAuthSnapshot,
} from './protocol.js'
import { readCodexAuthStatus, type CredentialStore } from './status.js'

export interface CodexLoginDockHostOptions {
  readonly credentials: CredentialStore
  readonly oauthCredentialRef: CredentialRef
  readonly accessTokenRef: CredentialRef
  readonly loginLine?: string
  readonly logoutLine?: string
  readonly findLoginCommand: (agent: Agent) => boolean
  readonly executeCommand: (
    agent: Agent,
    line: string,
    signal: AbortSignal,
  ) => Promise<CommandExecution | undefined>
}

export interface CodexLoginDockHost {
  status(agent: Agent): Promise<CodexAuthSnapshot>
  startBrowserLogin(agent: Agent, signal?: AbortSignal): Promise<CodexAuthSnapshot>
  logout(agent: Agent, signal?: AbortSignal): Promise<CodexAuthSnapshot>
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
  const loginLine = options.loginLine ?? DEFAULT_LOGIN_LINE
  const logoutLine = options.logoutLine ?? DEFAULT_LOGOUT_LINE
  let authorizing = false
  let loginAbort: AbortController | undefined
  let lastAgent: Agent | undefined

  const readStatus = (agent: Agent, authorizingOverride?: boolean): Promise<CodexAuthSnapshot> => {
    lastAgent = agent
    return readCodexAuthStatus({
      credentials: options.credentials,
      oauthCredentialRef: options.oauthCredentialRef,
      accessTokenRef: options.accessTokenRef,
      oauthPluginPresent: options.findLoginCommand(agent),
      ...authorizingOverride === undefined ? {} : { authorizing: authorizingOverride },
    })
  }

  const status = async (agent: Agent): Promise<CodexAuthSnapshot> => readStatus(agent, authorizing)

  const cancelLogin = async (): Promise<CodexAuthSnapshot> => {
    loginAbort?.abort(new Error('login cancelled'))
    if (lastAgent === undefined) {
      return {
        state: 'signedOut',
        providerId: CODEX_PROVIDER_ID,
        oauthPluginPresent: false,
        credentialConfigured: false,
        errorCode: 'LOGIN_CANCELLED',
        errorMessage: '浏览器登录已取消。',
      }
    }
    return cancelledSnapshot(await readStatus(lastAgent, false))
  }

  const startBrowserLogin = async (
    agent: Agent,
    signal?: AbortSignal,
  ): Promise<CodexAuthSnapshot> => {
    lastAgent = agent
    if (authorizing) {
      return {
        ...(await readStatus(agent, true)),
        state: 'error',
        errorCode: 'LOGIN_IN_PROGRESS',
        errorMessage: '另一个浏览器登录正在进行。',
      }
    }
    if (!options.findLoginCommand(agent)) {
      return readStatus(agent, false)
    }

    authorizing = true
    const controller = new AbortController()
    loginAbort = controller
    const combined = signal === undefined
      ? controller.signal
      : AbortSignal.any([controller.signal, signal])
    try {
      const execution = await options.executeCommand(agent, loginLine, combined)
      if (execution === undefined) {
        return {
          state: 'missingPlugin',
          providerId: CODEX_PROVIDER_ID,
          oauthPluginPresent: false,
          credentialConfigured: false,
          errorCode: 'OAUTH_PLUGIN_MISSING',
          errorMessage: '未安装 dsh-openai-codex-oauth，无法登录 Codex 订阅。',
        }
      }
      if (execution.result.kind === 'error') {
        const mapped = mapLoginFailure(execution.result.text)
        return {
          state: mapped.code === 'AUTH_EXPIRED' ? 'expired' : 'error',
          providerId: CODEX_PROVIDER_ID,
          oauthPluginPresent: true,
          credentialConfigured: false,
          errorCode: mapped.code,
          errorMessage: mapped.message,
        }
      }
      return await readStatus(agent, false)
    } catch (error: unknown) {
      if (combined.aborted) {
        return cancelledSnapshot(await readStatus(agent, false))
      }
      const text = error instanceof Error ? error.message : '浏览器登录失败，请重试。'
      const mapped = mapLoginFailure(text)
      return {
        state: 'error',
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

  const logout = async (
    agent: Agent,
    signal?: AbortSignal,
  ): Promise<CodexAuthSnapshot> => {
    lastAgent = agent
    if (authorizing) {
      return {
        ...(await readStatus(agent, true)),
        state: 'error',
        errorCode: 'LOGIN_IN_PROGRESS',
        errorMessage: '另一个浏览器登录正在进行。',
      }
    }
    if (!options.findLoginCommand(agent)) {
      return readStatus(agent, false)
    }
    try {
      const execution = await options.executeCommand(
        agent,
        logoutLine,
        signal ?? new AbortController().signal,
      )
      if (execution === undefined) {
        return {
          state: 'missingPlugin',
          providerId: CODEX_PROVIDER_ID,
          oauthPluginPresent: false,
          credentialConfigured: false,
          errorCode: 'OAUTH_PLUGIN_MISSING',
          errorMessage: '未安装 dsh-openai-codex-oauth，无法退出 Codex 订阅。',
        }
      }
      if (execution.result.kind === 'error') {
        const mapped = mapLoginFailure(execution.result.text)
        return {
          state: mapped.code === 'AUTH_EXPIRED' ? 'expired' : 'error',
          providerId: CODEX_PROVIDER_ID,
          oauthPluginPresent: true,
          credentialConfigured: true,
          errorCode: mapped.code,
          errorMessage: mapped.code === 'LOGIN_FAILED' ? '退出登录失败，请重试。' : mapped.message,
        }
      }
      return await readStatus(agent, false)
    } catch (error: unknown) {
      if (signal?.aborted === true) {
        return cancelledSnapshot(await readStatus(agent, false))
      }
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
      handler: async (invocation) => commandResult(await status(invocation.agent)),
    },
    {
      name: 'codex-auth-login',
      description: '通过已安装的 OAuth 插件启动浏览器 PKCE 登录',
      handler: async (invocation) => (
        commandResult(await startBrowserLogin(invocation.agent, invocation.signal))
      ),
    },
    {
      name: 'codex-auth-cancel',
      description: '取消进行中的 Codex 订阅浏览器登录',
      handler: async () => commandResult(await cancelLogin()),
    },
    {
      name: 'codex-auth-logout',
      description: '通过已安装的 OAuth 插件退出 Codex 订阅登录',
      handler: async (invocation) => (
        commandResult(await logout(invocation.agent, invocation.signal))
      ),
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
