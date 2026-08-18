/** Secret-free Codex subscription auth states for Host commands, dock, and Settings. */
export const CODEX_PROVIDER_ID = 'openai-codex'

export const DEFAULT_OAUTH_CREDENTIAL_REF = 'OPENAI_CODEX_OAUTH_CREDENTIAL'
export const DEFAULT_ACCESS_TOKEN_REF = 'OPENAI_CODEX_ACCESS_TOKEN'

export type CodexAuthState =
  | 'missingPlugin'
  | 'signedOut'
  | 'authorizing'
  | 'ready'
  | 'expired'
  | 'error'

export type CodexAuthErrorCode =
  | 'OAUTH_PLUGIN_MISSING'
  | 'INVALID_CREDENTIAL'
  | 'LOGIN_IN_PROGRESS'
  | 'LOGIN_CANCELLED'
  | 'LOGIN_FAILED'
  | 'CALLBACK_PORT_BUSY'
  | 'AUTH_EXPIRED'

export interface CodexAuthSnapshot {
  readonly state: CodexAuthState
  readonly providerId: typeof CODEX_PROVIDER_ID
  readonly oauthPluginPresent: boolean
  readonly credentialConfigured: boolean
  readonly expiresAt?: number
  readonly credentialSource?: string
  readonly errorCode?: CodexAuthErrorCode
  readonly errorMessage?: string
}

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
const ACCESS_JSON_PATTERN = /"access"\s*:\s*"[^"]*"/g
const REFRESH_JSON_PATTERN = /"refresh"\s*:\s*"[^"]*"/g

/** Strip credential material from text that may reach logs or command output. */
export function redactCredentialText(text: string, secrets: readonly string[] = []): string {
  let redacted = text
  for (const secret of secrets) {
    if (secret.length < 8) continue
    redacted = redacted.split(secret).join('[redacted]')
  }
  return redacted
    .replace(JWT_PATTERN, '[redacted-jwt]')
    .replace(ACCESS_JSON_PATTERN, '"access":"[redacted]"')
    .replace(REFRESH_JSON_PATTERN, '"refresh":"[redacted]"')
}

export function mapLoginFailure(text: string): {
  code: CodexAuthErrorCode
  message: string
} {
  const redacted = redactCredentialText(text)
  if (/cancel|abort/iu.test(redacted)) {
    return { code: 'LOGIN_CANCELLED', message: '浏览器登录已取消。' }
  }
  if (/另一个.*登录正在进行|in progress/iu.test(redacted)) {
    return { code: 'LOGIN_IN_PROGRESS', message: '另一个浏览器登录正在进行。' }
  }
  if (/1455|EADDRINUSE|listen/iu.test(redacted)) {
    return {
      code: 'CALLBACK_PORT_BUSY',
      message: '无法监听 localhost:1455，请结束占用该端口的登录或 Codex 进程后重试。',
    }
  }
  if (/refresh|invalid_grant|expired/iu.test(redacted)) {
    return { code: 'AUTH_EXPIRED', message: '登录已过期，请重新登录。' }
  }
  return { code: 'LOGIN_FAILED', message: '浏览器登录失败，请重试。' }
}

export function formatAuthSnapshot(snapshot: CodexAuthSnapshot): string {
  const stateLabel = {
    missingPlugin: '未安装 OAuth 插件',
    signedOut: '未登录',
    authorizing: '正在等待浏览器授权',
    ready: '已连接',
    expired: '登录已过期',
    error: '异常',
  }[snapshot.state]
  const lines = [
    `Codex 订阅认证：${stateLabel}`,
    `OAuth 插件：${snapshot.oauthPluginPresent ? '已安装' : '未安装'}`,
    `凭据：${snapshot.credentialConfigured ? '已配置' : '未配置'}`,
  ]
  if (snapshot.credentialSource !== undefined) {
    lines.push(`凭据来源：${snapshot.credentialSource}`)
  }
  if (snapshot.expiresAt !== undefined) {
    lines.push(`access 到期：${new Date(snapshot.expiresAt).toISOString()}`)
  }
  if (snapshot.errorCode !== undefined) {
    lines.push(`错误码：${snapshot.errorCode}`)
  }
  if (snapshot.errorMessage !== undefined) {
    lines.push(snapshot.errorMessage)
  }
  return lines.join('\n')
}

export function snapshotContainsForbiddenMaterial(
  snapshot: CodexAuthSnapshot,
  secrets: readonly string[],
): boolean {
  const encoded = JSON.stringify(snapshot)
  return secrets.some((secret) => secret.length >= 8 && encoded.includes(secret))
}

const AUTH_STATES: readonly CodexAuthState[] = [
  'missingPlugin',
  'signedOut',
  'authorizing',
  'ready',
  'expired',
  'error',
]

const AUTH_ERROR_CODES: readonly CodexAuthErrorCode[] = [
  'OAUTH_PLUGIN_MISSING',
  'INVALID_CREDENTIAL',
  'LOGIN_IN_PROGRESS',
  'LOGIN_CANCELLED',
  'LOGIN_FAILED',
  'CALLBACK_PORT_BUSY',
  'AUTH_EXPIRED',
]

function isAuthState(value: unknown): value is CodexAuthState {
  return typeof value === 'string' && (AUTH_STATES as readonly string[]).includes(value)
}

function isAuthErrorCode(value: unknown): value is CodexAuthErrorCode {
  return typeof value === 'string' && (AUTH_ERROR_CODES as readonly string[]).includes(value)
}

function optionalSnapshotField<K extends keyof CodexAuthSnapshot>(
  key: K,
  value: CodexAuthSnapshot[K] | undefined,
): Pick<CodexAuthSnapshot, K> | Record<string, never> {
  return value === undefined ? {} : { [key]: value } as Pick<CodexAuthSnapshot, K>
}

/**
 * Rebuild a snapshot from RPC or command JSON, copying only secret-free fields.
 * Unknown objects and token-shaped payloads are rejected rather than passed through.
 */
export function parseAuthSnapshot(value: unknown): CodexAuthSnapshot | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (!isAuthState(record.state)) return undefined
  if (record.providerId !== CODEX_PROVIDER_ID) return undefined
  if (typeof record.oauthPluginPresent !== 'boolean') return undefined
  if (typeof record.credentialConfigured !== 'boolean') return undefined
  const expiresAt = typeof record.expiresAt === 'number' && Number.isFinite(record.expiresAt)
    ? record.expiresAt
    : undefined
  const credentialSource = typeof record.credentialSource === 'string'
    ? record.credentialSource
    : undefined
  const errorCode = isAuthErrorCode(record.errorCode) ? record.errorCode : undefined
  const errorMessage = typeof record.errorMessage === 'string'
    ? redactCredentialText(record.errorMessage)
    : undefined
  return {
    state: record.state,
    providerId: CODEX_PROVIDER_ID,
    oauthPluginPresent: record.oauthPluginPresent,
    credentialConfigured: record.credentialConfigured,
    ...optionalSnapshotField('expiresAt', expiresAt),
    ...optionalSnapshotField('credentialSource', credentialSource),
    ...optionalSnapshotField('errorCode', errorCode),
    ...optionalSnapshotField('errorMessage', errorMessage),
  }
}

/** Host RPC namespace and Cordis service key. */
export const CODEX_LOGIN_DOCK_SERVICE = 'codexLoginDock'

/** Dock list order: after Todo (0), Goal (10), and Queue (20), against the composer. */
export const LOGIN_DOCK_ORDER = 30

export const LOGIN_DOCK_ID = 'codex-login'

/** Settings nav id. Independent page; not nested under the native Models row. */
export const SETTINGS_SECTION_ID = 'codex-subscription'

/** After Models (10); before typical Plugins / later product sections. */
export const SETTINGS_SECTION_ORDER = 25

export const AUTH_OPERATION_FAILED_MESSAGE = 'Codex 订阅操作失败，请重试。'

export function unavailableSessionSnapshot(message: string = AUTH_OPERATION_FAILED_MESSAGE): CodexAuthSnapshot {
  return {
    state: 'error',
    providerId: CODEX_PROVIDER_ID,
    oauthPluginPresent: false,
    credentialConfigured: false,
    errorCode: 'LOGIN_FAILED',
    errorMessage: message,
  }
}
