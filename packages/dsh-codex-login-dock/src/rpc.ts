import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'

import type { CodexLoginDockHost } from './host.js'
import {
  CODEX_LOGIN_DOCK_SERVICE,
  SESSION_UNAVAILABLE_MESSAGE,
  unavailableSessionSnapshot,
  type CodexAuthSnapshot,
} from './protocol.js'

export interface CodexLoginDockRpc {
  status(sessionId: string): Promise<CodexAuthSnapshot>
  login(sessionId: string): Promise<CodexAuthSnapshot>
  cancel(sessionId: string): Promise<CodexAuthSnapshot>
  logout(sessionId: string): Promise<CodexAuthSnapshot>
}

export interface CodexLoginDockRpcOptions {
  readonly host: CodexLoginDockHost
  readonly getAgent: (sessionId: string) => Agent | undefined
  readonly listAgents: () => readonly Agent[]
}

export function createCodexLoginDockRpc(options: CodexLoginDockRpcOptions): CodexLoginDockRpc {
  const resolveAgent = (sessionId: string): Agent | undefined => {
    const trimmed = sessionId.trim()
    if (trimmed !== '') {
      const hit = options.getAgent(trimmed)
      if (hit !== undefined) return hit
    }
    return options.listAgents()[0]
  }

  return {
    async status(sessionId) {
      const agent = resolveAgent(sessionId)
      if (agent === undefined) return unavailableSessionSnapshot(SESSION_UNAVAILABLE_MESSAGE)
      return options.host.status(agent)
    },
    async login(sessionId) {
      const agent = resolveAgent(sessionId)
      if (agent === undefined) return unavailableSessionSnapshot(SESSION_UNAVAILABLE_MESSAGE)
      return options.host.startBrowserLogin(agent)
    },
    async cancel(_sessionId) {
      return options.host.cancelLogin()
    },
    async logout(sessionId) {
      const agent = resolveAgent(sessionId)
      if (agent === undefined) return unavailableSessionSnapshot(SESSION_UNAVAILABLE_MESSAGE)
      return options.host.logout(agent)
    },
  }
}

/**
 * Typert Gateway face for the Web dock and Settings page. Methods return
 * {@link CodexAuthSnapshot} only; tokens never cross this boundary.
 */
export class CodexLoginDockRemote extends TypertRemoteService<never> {
  static inject = ['agents']

  private readonly rpc: CodexLoginDockRpc

  constructor(ctx: Context, config: { host: CodexLoginDockHost }) {
    super(ctx, CODEX_LOGIN_DOCK_SERVICE)
    this.rpc = createCodexLoginDockRpc({
      host: config.host,
      getAgent: (sessionId) => ctx.agents.get(sessionId as Agent['id']),
      listAgents: () => ctx.agents.list(),
    })
  }

  @Remote('status')
  async status(sessionId: string): Promise<CodexAuthSnapshot> {
    return this.rpc.status(sessionId)
  }

  @Remote('login')
  async login(sessionId: string): Promise<CodexAuthSnapshot> {
    return this.rpc.login(sessionId)
  }

  @Remote('cancel')
  async cancel(sessionId: string): Promise<CodexAuthSnapshot> {
    return this.rpc.cancel(sessionId)
  }

  @Remote('logout')
  async logout(sessionId: string): Promise<CodexAuthSnapshot> {
    return this.rpc.logout(sessionId)
  }
}
