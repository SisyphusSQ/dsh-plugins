import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import z from '@deepseek-ai/schemastery'

import { createCodexLoginDockHost, type CodexOAuthSilent } from './host.js'
import {
  DEFAULT_ACCESS_TOKEN_REF,
  DEFAULT_OAUTH_CREDENTIAL_REF,
} from './protocol.js'
import { CodexLoginDockRemote } from './rpc.js'

export const name = 'codex-login-dock'

export const inject = ['commands', 'credentials']

export const Config = z.object({
  oauthCredentialRef: z.string().role('credential-ref').default(DEFAULT_OAUTH_CREDENTIAL_REF),
  accessTokenRef: z.string().role('credential-ref').default(DEFAULT_ACCESS_TOKEN_REF),
})

export interface CodexLoginDockConfig {
  oauthCredentialRef?: string
  accessTokenRef?: string
}

export function apply(ctx: Context, config: Partial<CodexLoginDockConfig> = {}): void {
  let oauth: CodexOAuthSilent | undefined
  ctx.inject(['openaiCodexOAuth'], (inner) => {
    const face = (inner as Context & { openaiCodexOAuth: CodexOAuthSilent }).openaiCodexOAuth
    if (typeof face.loginBrowser !== 'function' || typeof face.logout !== 'function') {
      return () => undefined
    }
    oauth = face
    return () => {
      oauth = undefined
    }
  })
  const host = createCodexLoginDockHost({
    credentials: ctx.credentials,
    oauthCredentialRef: credentialRef(config.oauthCredentialRef ?? DEFAULT_OAUTH_CREDENTIAL_REF),
    accessTokenRef: credentialRef(config.accessTokenRef ?? DEFAULT_ACCESS_TOKEN_REF),
    getOAuth: () => oauth,
  })
  for (const definition of host.commands()) ctx.commands.register(definition)
  ctx.plugin(CodexLoginDockRemote, { host })
}

export { createCodexLoginDockHost } from './host.js'
export { formatAuthSnapshot, parseAuthSnapshot, redactCredentialText } from './protocol.js'
export { createCodexLoginDockRpc, CodexLoginDockRemote } from './rpc.js'
export { readCodexAuthStatus } from './status.js'
export type { CodexLoginDockHost, CodexLoginDockHostOptions, CodexOAuthSilent } from './host.js'
export type { CodexLoginDockRpc, CodexLoginDockRpcOptions } from './rpc.js'
export type {
  CodexAuthErrorCode,
  CodexAuthSnapshot,
  CodexAuthState,
} from './protocol.js'
export type { CredentialStore, ReadCodexAuthStatusInput } from './status.js'
