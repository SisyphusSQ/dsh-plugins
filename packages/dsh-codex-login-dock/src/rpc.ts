import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'

import type { CodexLoginDockHost } from './host.js'
import {
  CODEX_LOGIN_DOCK_SERVICE,
  type CodexAuthSnapshot,
} from './protocol.js'

export interface CodexLoginDockRpc {
  status(): Promise<CodexAuthSnapshot>
  login(): Promise<CodexAuthSnapshot>
  cancel(): Promise<CodexAuthSnapshot>
  logout(): Promise<CodexAuthSnapshot>
}

export interface CodexLoginDockRpcOptions {
  readonly host: CodexLoginDockHost
}

export function createCodexLoginDockRpc(options: CodexLoginDockRpcOptions): CodexLoginDockRpc {
  return {
    status: () => options.host.status(),
    login: () => options.host.startBrowserLogin(),
    cancel: () => options.host.cancelLogin(),
    logout: () => options.host.logout(),
  }
}

/**
 * Typert Gateway face for the Web dock and Settings page. Methods return
 * {@link CodexAuthSnapshot} only; tokens never cross this boundary.
 * SRC reflection uses parameter names as wire fields, so these methods take
 * no args: silent login is process-global credentials, not a live agent.
 */
export class CodexLoginDockRemote extends TypertRemoteService<never> {
  private readonly rpc: CodexLoginDockRpc

  constructor(ctx: Context, config: { host: CodexLoginDockHost }) {
    super(ctx, CODEX_LOGIN_DOCK_SERVICE)
    this.rpc = createCodexLoginDockRpc({ host: config.host })
  }

  @Remote('status')
  async status(): Promise<CodexAuthSnapshot> {
    return this.rpc.status()
  }

  @Remote('login')
  async login(): Promise<CodexAuthSnapshot> {
    return this.rpc.login()
  }

  @Remote('cancel')
  async cancel(): Promise<CodexAuthSnapshot> {
    return this.rpc.cancel()
  }

  @Remote('logout')
  async logout(): Promise<CodexAuthSnapshot> {
    return this.rpc.logout()
  }
}
