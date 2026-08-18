import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { LOGIN_DOCK_ID, LOGIN_DOCK_ORDER, SETTINGS_SECTION_ID, SETTINGS_SECTION_ORDER } from '../src/protocol.js'
import { apply, inject, name } from '../src/client/index.js'
import { CODEX_LOGIN_NS, en, zh } from '../src/client/locales.js'

describe('client plugin contribution', () => {
  it('registers the login dock and the settings section', () => {
    const registerSlot = vi.fn()
    const injectSlot = vi.fn((_name: string, install: () => void) => install())
    const registerLocale = vi.fn(() => vi.fn())
    const bindLocale = vi.fn(() => (key: string) => key)
    const effect = vi.fn((install: () => unknown) => install())
    const onRemote = vi.fn(() => vi.fn())
    const onEvent = vi.fn(() => vi.fn())
    const ctx = {
      slots: { inject: injectSlot, register: registerSlot },
      locale: { register: registerLocale, bind: bindLocale },
      conversation: { blocks: { set: vi.fn() } },
      get: (key: string) => {
        if (key === 'connection') return { rpc: { call: vi.fn() } }
        if (key === 'modelDirectories') return { directoryFor: vi.fn() }
        return undefined
      },
      remote: { $on: onRemote },
      on: onEvent,
      effect,
    } as unknown as ClientContext

    apply(ctx)

    expect(name).toBe('codex-login-dock')
    expect(inject).toEqual(['slots', 'conversation', 'connection', 'locale', 'modelDirectories', 'remote'])
    expect(registerLocale).toHaveBeenCalledWith(CODEX_LOGIN_NS, { zh, en })
    expect(injectSlot).toHaveBeenCalledWith('conversation.input.dock', expect.any(Function))
    expect(injectSlot).toHaveBeenCalledWith('settings.section', expect.any(Function))
    expect(registerSlot).toHaveBeenCalledWith({
      name: 'conversation.input.dock',
      id: LOGIN_DOCK_ID,
      order: LOGIN_DOCK_ORDER,
      locale: CODEX_LOGIN_NS,
    }, expect.any(Function))
    expect(registerSlot).toHaveBeenCalledWith({
      name: 'settings.section',
      id: SETTINGS_SECTION_ID,
      order: SETTINGS_SECTION_ORDER,
      label: expect.any(Function),
      locale: CODEX_LOGIN_NS,
    }, expect.any(Function))
  })
})
