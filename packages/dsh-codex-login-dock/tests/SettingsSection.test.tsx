import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CODEX_PROVIDER_ID, type CodexAuthSnapshot } from '../src/protocol.js'
import { SettingsSectionView, type SettingsSectionDeps } from '../src/client/SettingsSection.js'
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

function createDeps(snapshot: CodexAuthSnapshot): SettingsSectionDeps & {
  logout: ReturnType<typeof vi.fn>
  login: ReturnType<typeof vi.fn>
} {
  const logout = vi.fn(async () => signedOut)
  const login = vi.fn(async () => ready)
  return {
    logout,
    login,
    api: {
      status: vi.fn(async () => snapshot),
      login,
      cancel: vi.fn(async () => signedOut),
      logout,
    },
  }
}

describe('SettingsSectionView', () => {
  it('renders the signed-out card without Later', async () => {
    render(
      <SettingsSectionView
        sessionId="session-1"
        t={t as never}
        deps={createDeps(signedOut)}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('Codex 订阅需要登录')).toBeTruthy()
    })
    expect(screen.getByText('打开浏览器登录')).toBeTruthy()
    expect(screen.queryByText('稍后')).toBeNull()
  })

  it('shows Connected and signs out through RPC', async () => {
    const deps = createDeps(ready)
    render(
      <SettingsSectionView
        sessionId="session-1"
        t={t as never}
        deps={deps}
      />,
    )
    await screen.findByText('Codex 订阅已连接')
    expect(screen.getByText('退出登录')).toBeTruthy()
    expect(screen.queryByText('稍后')).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByText('退出登录'))
    })
    expect(deps.logout).toHaveBeenCalledWith('session-1')
    await waitFor(() => {
      expect(screen.getByText('Codex 订阅需要登录')).toBeTruthy()
    })
  })
})
