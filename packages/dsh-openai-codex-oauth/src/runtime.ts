import { createServer } from 'node:net'

import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { AuthInteraction, OAuthAuth, OAuthCredential } from '@earendil-works/pi-ai'
import { LlmError } from '@deepseek-ai/dsh-llm'

import type { OpenUrl } from './open-url.js'
import { createSilentBrowserInteraction } from './silent.js'

export const DEFAULT_OAUTH_CREDENTIAL_REF = 'OPENAI_CODEX_OAUTH_CREDENTIAL'
export const DEFAULT_ACCESS_TOKEN_REF = 'OPENAI_CODEX_ACCESS_TOKEN'
export const DEFAULT_REFRESH_BEFORE_MS = 5 * 60 * 1000
export const CALLBACK_PORT = 1455
export const CALLBACK_HOST = '127.0.0.1'
export const LOGIN_IN_PROGRESS_MESSAGE = '另一个 OpenAI OAuth 登录正在进行。'
export const CALLBACK_PORT_BUSY_MESSAGE = 'listen EADDRINUSE 127.0.0.1:1455'

export interface CredentialStore {
  resolve(ref: CredentialRef): Promise<{ value: string; source?: string } | undefined>
  describe(ref: CredentialRef): Promise<{ configured: boolean; writable: boolean; source?: string }>
  set(ref: CredentialRef, value: string): Promise<void>
  unset(ref: CredentialRef): Promise<void>
}

export interface CodexOAuthRuntimeOptions {
  readonly credentials: CredentialStore
  readonly oauth: Pick<OAuthAuth, 'login' | 'refresh'>
  readonly openUrl: OpenUrl
  readonly oauthCredentialRef?: CredentialRef
  readonly accessTokenRef?: CredentialRef
  readonly refreshBeforeMs?: number
  readonly callbackHost?: string
  readonly callbackPort?: number
  readonly ensureCallbackPort?: () => Promise<void>
}

export interface CodexOAuthRuntime {
  loginBrowser(signal?: AbortSignal): Promise<void>
  loginWithInteraction(interaction: AuthInteraction): Promise<OAuthCredential>
  logout(): Promise<void>
  statusText(): Promise<string>
  ensureAccessToken(signal: AbortSignal): Promise<void>
}

function createExclusiveRunner(): <T>(operation: () => Promise<T>) => Promise<T> {
  let tail: Promise<void> = Promise.resolve()
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    const run = tail.then(operation, operation)
    tail = run.then(() => undefined, () => undefined)
    return run
  }
}

export function parseOAuthCredential(raw: string): OAuthCredential {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('stored OpenAI OAuth credential is not valid JSON')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('stored OpenAI OAuth credential has an invalid value')
  }
  const candidate = value as Partial<OAuthCredential>
  if (candidate.type !== 'oauth'
    || typeof candidate.access !== 'string' || candidate.access.length === 0
    || typeof candidate.refresh !== 'string' || candidate.refresh.length === 0
    || typeof candidate.expires !== 'number' || !Number.isFinite(candidate.expires)) {
    throw new Error('stored OpenAI OAuth credential is missing required fields')
  }
  return value as OAuthCredential
}

export function expiryDescription(credential: OAuthCredential): string {
  const remainingMinutes = Math.max(0, Math.ceil((credential.expires - Date.now()) / 60_000))
  return `${new Date(credential.expires).toISOString()}（约 ${remainingMinutes} 分钟后）`
}

export async function assertCallbackPortFree(
  port: number = CALLBACK_PORT,
  host: string = CALLBACK_HOST,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer()
    const fail = (error: NodeJS.ErrnoException) => {
      server.close()
      if (error.code === 'EADDRINUSE') {
        reject(new Error(CALLBACK_PORT_BUSY_MESSAGE))
        return
      }
      reject(error)
    }
    server.once('error', fail)
    server.listen(port, host, () => {
      server.close((closeError) => {
        if (closeError !== undefined) {
          reject(closeError)
          return
        }
        resolve()
      })
    })
  })
}

async function assertWritable(credentials: CredentialStore, ref: CredentialRef): Promise<void> {
  const info = await credentials.describe(ref)
  if (!info.writable) {
    throw new Error(`credential reference ${ref} is supplied by read-only source ${info.source ?? 'unknown'}`)
  }
}

export function createCodexOAuthRuntime(options: CodexOAuthRuntimeOptions): CodexOAuthRuntime {
  const oauthCredentialRef = options.oauthCredentialRef ?? credentialRef(DEFAULT_OAUTH_CREDENTIAL_REF)
  const accessTokenRef = options.accessTokenRef ?? credentialRef(DEFAULT_ACCESS_TOKEN_REF)
  const refreshBeforeMs = options.refreshBeforeMs ?? DEFAULT_REFRESH_BEFORE_MS
  const callbackHost = options.callbackHost ?? CALLBACK_HOST
  const callbackPort = options.callbackPort ?? CALLBACK_PORT
  const exclusive = createExclusiveRunner()
  let loginInProgress = false

  const persist = async (credential: OAuthCredential): Promise<void> => {
    await options.credentials.set(oauthCredentialRef, JSON.stringify(credential))
    await options.credentials.set(accessTokenRef, credential.access)
  }

  const loginWithInteraction = async (interaction: AuthInteraction): Promise<OAuthCredential> => {
    if (loginInProgress) throw new Error(LOGIN_IN_PROGRESS_MESSAGE)
    loginInProgress = true
    try {
      await assertWritable(options.credentials, oauthCredentialRef)
      await assertWritable(options.credentials, accessTokenRef)
      const credential = await options.oauth.login(interaction)
      await exclusive(() => persist(credential))
      return credential
    } finally {
      loginInProgress = false
    }
  }

  return {
    loginWithInteraction,
    async loginBrowser(signal) {
      await (options.ensureCallbackPort ?? (() => assertCallbackPortFree(callbackPort, callbackHost)))()
      const interaction = createSilentBrowserInteraction({
        openUrl: options.openUrl,
        ...signal === undefined ? {} : { signal },
      })
      await loginWithInteraction(interaction)
    },
    async logout() {
      await exclusive(async () => {
        await options.credentials.unset(oauthCredentialRef)
        await options.credentials.unset(accessTokenRef)
      })
    },
    async statusText() {
      const stored = await options.credentials.resolve(oauthCredentialRef)
      if (stored !== undefined) {
        try {
          const credential = parseOAuthCredential(stored.value)
          return `OpenAI Codex OAuth：已登录。访问令牌到期时间：${expiryDescription(credential)}。凭据来源：${stored.source ?? 'unknown'}。`
        } catch {
          return 'OpenAI Codex OAuth 凭据格式错误，请重新运行 /codex-login。'
        }
      }
      const access = await options.credentials.resolve(accessTokenRef)
      if (access !== undefined && access.value.length > 0) {
        return `OpenAI Codex：访问令牌已配置。凭据来源：${access.source ?? 'unknown'}。`
      }
      return 'OpenAI Codex 登录状态：未配置。运行 /codex-login 开始登录。'
    },
    async ensureAccessToken(signal) {
      await exclusive(async () => {
        if (signal.aborted) {
          throw new LlmError('OpenAI Codex request was aborted before authentication completed.', 'ABORTED')
        }
        const access = await options.credentials.resolve(accessTokenRef)
        if (access !== undefined && access.value.length > 0 && access.source !== 'file') return

        const stored = await options.credentials.resolve(oauthCredentialRef)
        if (stored === undefined) {
          if (access !== undefined && access.value.length > 0) return
          throw new LlmError(
            'OpenAI Codex OAuth is not configured. Run /codex-login, then retry the request.',
            'AUTH',
          )
        }

        let credential: OAuthCredential
        try {
          credential = parseOAuthCredential(stored.value)
        } catch (error: unknown) {
          throw new LlmError(
            'The stored OpenAI Codex OAuth credential is invalid. Run /codex-login again.',
            'AUTH',
            { cause: error },
          )
        }

        if (credential.expires > Date.now() + refreshBeforeMs) {
          if (access === undefined || access.value !== credential.access) {
            await options.credentials.set(accessTokenRef, credential.access)
          }
          return
        }

        let refreshed: OAuthCredential
        try {
          refreshed = await options.oauth.refresh(credential, signal)
        } catch {
          throw new LlmError(
            'OpenAI Codex OAuth refresh failed. Run /codex-login again.',
            'AUTH',
          )
        }
        await persist(refreshed)
      })
    },
  }
}
