import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { CODEX_LOGIN_DOCK_SERVICE, parseAuthSnapshot, type CodexAuthSnapshot } from '../protocol.js'

export interface CodexAuthClient {
  status(): Promise<CodexAuthSnapshot>
  login(): Promise<CodexAuthSnapshot>
  cancel(): Promise<CodexAuthSnapshot>
  logout(): Promise<CodexAuthSnapshot>
}

interface RpcResultEnvelope {
  ok?: boolean
  value?: unknown
  error?: { message?: string }
}

function snapshotFromRpc(result: unknown, fallback: string): CodexAuthSnapshot {
  const envelope = result as RpcResultEnvelope
  if (envelope.ok === false) {
    throw new Error(envelope.error?.message ?? fallback)
  }
  const snapshot = parseAuthSnapshot(envelope.ok === true ? envelope.value : result)
  if (snapshot === undefined) {
    throw new Error(fallback)
  }
  return snapshot
}

export function createCodexAuthClient(rpc: ClientConnectionRpc): CodexAuthClient {
  const call = async (
    method: 'status' | 'login' | 'cancel' | 'logout',
  ): Promise<CodexAuthSnapshot> => {
    const result = await rpc.call('/api', `${CODEX_LOGIN_DOCK_SERVICE}/${method}`, { args: {} })
    return snapshotFromRpc(result, `codexLoginDock/${method} returned an unreadable snapshot`)
  }
  return {
    status: () => call('status'),
    login: () => call('login'),
    cancel: () => call('cancel'),
    logout: () => call('logout'),
  }
}
