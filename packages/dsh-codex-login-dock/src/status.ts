import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'

import {
  CODEX_PROVIDER_ID,
  type CodexAuthSnapshot,
  redactCredentialText,
} from './protocol.js'

export interface CredentialStore {
  resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined>
  describe(ref: CredentialRef): Promise<CredentialInfo>
}

export interface ReadCodexAuthStatusInput {
  readonly credentials: CredentialStore
  readonly oauthCredentialRef: CredentialRef
  readonly accessTokenRef: CredentialRef
  readonly oauthPluginPresent: boolean
  readonly authorizing?: boolean
}

interface ParsedOAuthCredential {
  readonly expires?: number
  readonly hasRefresh: boolean
  readonly secrets: readonly string[]
}

function optionalField<K extends keyof CodexAuthSnapshot>(
  key: K,
  value: CodexAuthSnapshot[K] | undefined,
): Pick<CodexAuthSnapshot, K> | Record<string, never> {
  return value === undefined ? {} : { [key]: value } as Pick<CodexAuthSnapshot, K>
}

function parseOAuthCredential(raw: string): ParsedOAuthCredential | { error: string; secrets: readonly string[] } {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return {
      error: '存储的 OpenAI OAuth 凭据不是合法 JSON，请重新登录。',
      secrets: [],
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      error: '存储的 OpenAI OAuth 凭据格式无效，请重新登录。',
      secrets: [],
    }
  }
  const candidate = value as {
    type?: unknown
    access?: unknown
    refresh?: unknown
    expires?: unknown
  }
  const secrets = [
    typeof candidate.access === 'string' ? candidate.access : '',
    typeof candidate.refresh === 'string' ? candidate.refresh : '',
  ].filter((secret) => secret.length >= 8)
  if (candidate.type !== 'oauth') {
    return {
      error: '存储的 OpenAI OAuth 凭据缺少 type=oauth，请重新登录。',
      secrets,
    }
  }
  if (typeof candidate.access !== 'string' || candidate.access.length === 0) {
    return {
      error: '存储的 OpenAI OAuth 凭据缺少 access token，请重新登录。',
      secrets,
    }
  }
  const hasRefresh = typeof candidate.refresh === 'string' && candidate.refresh.length > 0
  if (typeof candidate.expires === 'number' && Number.isFinite(candidate.expires)) {
    return { expires: candidate.expires, hasRefresh, secrets }
  }
  return { hasRefresh, secrets }
}

export async function readCodexAuthStatus(
  input: ReadCodexAuthStatusInput,
): Promise<CodexAuthSnapshot> {
  const base = {
    providerId: CODEX_PROVIDER_ID,
    oauthPluginPresent: input.oauthPluginPresent,
  } as const

  if (!input.oauthPluginPresent) {
    const described = await input.credentials.describe(input.oauthCredentialRef)
    return {
      state: 'missingPlugin',
      ...base,
      credentialConfigured: described.configured,
      errorCode: 'OAUTH_PLUGIN_MISSING',
      errorMessage: '未安装 dsh-openai-codex-oauth，无法登录 Codex 订阅。',
      ...optionalField('credentialSource', described.source),
    }
  }

  if (input.authorizing === true) {
    return {
      state: 'authorizing',
      ...base,
      credentialConfigured: false,
    }
  }

  const described = await input.credentials.describe(input.oauthCredentialRef)
  const accessDescribed = await input.credentials.describe(input.accessTokenRef)
  const credentialConfigured = described.configured || accessDescribed.configured
  if (!credentialConfigured) {
    return {
      state: 'signedOut',
      ...base,
      credentialConfigured: false,
    }
  }

  const stored = described.configured
    ? await input.credentials.resolve(input.oauthCredentialRef)
    : undefined
  if (stored === undefined) {
    if (accessDescribed.configured) {
      return {
        state: 'ready',
        ...base,
        credentialConfigured: true,
        ...optionalField('credentialSource', accessDescribed.source),
      }
    }
    return {
      state: 'signedOut',
      ...base,
      credentialConfigured: false,
    }
  }

  const parsed = parseOAuthCredential(stored.value)
  if ('error' in parsed) {
    return {
      state: 'error',
      ...base,
      credentialConfigured: true,
      errorCode: 'INVALID_CREDENTIAL',
      errorMessage: redactCredentialText(parsed.error, parsed.secrets),
      ...optionalField('credentialSource', stored.source),
    }
  }

  if (!parsed.hasRefresh) {
    return {
      state: 'expired',
      ...base,
      credentialConfigured: true,
      errorCode: 'AUTH_EXPIRED',
      errorMessage: '登录已过期，请重新登录。',
      ...optionalField('expiresAt', parsed.expires),
      ...optionalField('credentialSource', stored.source),
    }
  }

  return {
    state: 'ready',
    ...base,
    credentialConfigured: true,
    ...optionalField('expiresAt', parsed.expires),
    ...optionalField('credentialSource', stored.source),
  }
}
