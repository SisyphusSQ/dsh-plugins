import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import z from '@deepseek-ai/schemastery'

import { createCodexLoginDockHost } from './host.js'
import {
  DEFAULT_ACCESS_TOKEN_REF,
  DEFAULT_LOGIN_COMMAND,
  DEFAULT_LOGIN_LINE,
  DEFAULT_LOGOUT_LINE,
  DEFAULT_OAUTH_CREDENTIAL_REF,
} from './protocol.js'
import { CodexLoginDockRemote } from './rpc.js'

export const name = 'codex-login-dock'

export const inject = ['commands', 'credentials', 'agents']

export const Config = z.object({
  oauthCredentialRef: z.string().role('credential-ref').default(DEFAULT_OAUTH_CREDENTIAL_REF),
  accessTokenRef: z.string().role('credential-ref').default(DEFAULT_ACCESS_TOKEN_REF),
  loginLine: z.string().default(DEFAULT_LOGIN_LINE),
  logoutLine: z.string().default(DEFAULT_LOGOUT_LINE),
  loginCommand: z.string().default(DEFAULT_LOGIN_COMMAND),
})

export interface CodexLoginDockConfig {
  oauthCredentialRef?: string
  accessTokenRef?: string
  loginLine?: string
  logoutLine?: string
  loginCommand?: string
}

export function apply(ctx: Context, config: Partial<CodexLoginDockConfig> = {}): void {
  const loginCommand = config.loginCommand ?? DEFAULT_LOGIN_COMMAND
  const host = createCodexLoginDockHost({
    credentials: ctx.credentials,
    oauthCredentialRef: credentialRef(config.oauthCredentialRef ?? DEFAULT_OAUTH_CREDENTIAL_REF),
    accessTokenRef: credentialRef(config.accessTokenRef ?? DEFAULT_ACCESS_TOKEN_REF),
    loginLine: config.loginLine ?? DEFAULT_LOGIN_LINE,
    logoutLine: config.logoutLine ?? DEFAULT_LOGOUT_LINE,
    findLoginCommand: (agent) => ctx.commands.find(agent, loginCommand) !== undefined,
    executeCommand: (agent, line, signal) => ctx.commands.execute(agent, line, signal),
  })
  for (const definition of host.commands()) ctx.commands.register(definition)
  ctx.plugin(CodexLoginDockRemote, { host })
}

export { createCodexLoginDockHost } from './host.js'
export { formatAuthSnapshot, parseAuthSnapshot, redactCredentialText } from './protocol.js'
export { createCodexLoginDockRpc, CodexLoginDockRemote } from './rpc.js'
export { readCodexAuthStatus } from './status.js'
export type { CodexLoginDockHost, CodexLoginDockHostOptions } from './host.js'
export type { CodexLoginDockRpc, CodexLoginDockRpcOptions } from './rpc.js'
export type {
  CodexAuthErrorCode,
  CodexAuthSnapshot,
  CodexAuthState,
} from './protocol.js'
export type { CredentialStore, ReadCodexAuthStatusInput } from './status.js'
