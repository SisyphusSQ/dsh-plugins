import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { CODEX_PROVIDER_ID, type CodexAuthSnapshot } from '../src/protocol.js'
import { LoginDockSession, type LoginDockDeps } from '../src/client/LoginDock.js'
import { zh } from '../src/client/locales.js'

vi.mock('../src/client/LoginDock.module.css', () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}))

const signedOut: CodexAuthSnapshot = {
  state: 'signedOut',
  providerId: CODEX_PROVIDER_ID,
  oauthPluginPresent: true,
  credentialConfigured: false,
}

const ready: CodexAuthSnapshot = {
  state: 'ready',
  providerId: CODEX_PROVIDER_ID,
  oauthPluginPresent: true,
  credentialConfigured: true,
}

afterEach(() => {
  cleanup()
})

function t(key: keyof typeof zh, params?: Record<string, string>): string {
  return (zh[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => params?.[name] ?? `{${name}}`)
}

function createDeps(snapshot: CodexAuthSnapshot, provider = CODEX_PROVIDER_ID): LoginDockDeps & {
  blocksSet: Array<{ sessionId: SessionId; reason?: string }>
  login: ReturnType<typeof vi.fn>
} {
  const listeners = new Set<() => void>()
  const blocksSet: Array<{ sessionId: SessionId; reason?: string }> = []
  const login = vi.fn(async () => ready)
  return {
    blocksSet,
    login,
    api: {
      status: vi.fn(async () => snapshot),
      login,
      cancel: vi.fn(async () => signedOut),
      logout: vi.fn(async () => signedOut),
    },
    directories: {
      directoryFor: () => ({
        store: {
          getSnapshot: () => ({ current: { provider, model: 'gpt-5.6-sol' } }),
          subscribe: (listener: () => void) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
        },
        load: async () => undefined,
      }),
    },
    blocks: {
      set: (sessionId, block) => {
        blocksSet.push({ sessionId, ...block === undefined ? {} : { reason: block.reason } })
      },
      storeFor: () => {
        throw new Error('unused')
      },
      forget: () => undefined,
    },
  }
}

describe('LoginDockSession', () => {
  it('renders the signed-out card, blocks send, and hides after later', async () => {
    const deps = createDeps(signedOut)
    render(
      <LoginDockSession
        sessionId={'session-1' as SessionId}
        isSubagent={false}
        t={t as never}
        deps={deps}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('Codex 订阅需要登录')).toBeTruthy()
    })
    expect(screen.getByText('打开浏览器登录')).toBeTruthy()
    expect(deps.blocksSet.at(-1)).toEqual({
      sessionId: 'session-1',
      reason: '登录 Codex 订阅后才能发送',
    })

    fireEvent.click(screen.getByText('稍后'))
    await waitFor(() => {
      expect(screen.queryByText('Codex 订阅需要登录')).toBeNull()
    })
    expect(deps.blocksSet.at(-1)).toEqual({
      sessionId: 'session-1',
      reason: '登录 Codex 订阅后才能发送',
    })
  })

  it('starts browser login and hides when ready', async () => {
    const deps = createDeps(signedOut)
    render(
      <LoginDockSession
        sessionId={'session-1' as SessionId}
        isSubagent={false}
        t={t as never}
        deps={deps}
      />,
    )
    await screen.findByText('打开浏览器登录')
    await act(async () => {
      fireEvent.click(screen.getByText('打开浏览器登录'))
    })
    expect(deps.login).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByText('Codex 订阅需要登录')).toBeNull()
    })
    expect(deps.blocksSet.at(-1)).toEqual({ sessionId: 'session-1' })
  })

  it('does not render or block for another provider', async () => {
    const deps = createDeps(signedOut, 'deepseek')
    const { container } = render(
      <LoginDockSession
        sessionId={'session-1' as SessionId}
        isSubagent={false}
        t={t as never}
        deps={deps}
      />,
    )
    await waitFor(() => {
      expect(deps.api.status).toHaveBeenCalled()
    })
    expect(container.textContent).toBe('')
    expect(deps.blocksSet.at(-1)).toEqual({ sessionId: 'session-1' })
  })
})
