import { describe, expect, it, vi } from 'vitest'
import { CODEX_PROVIDER_ID } from '../src/protocol.js'
import { createCodexAuthClient } from '../src/client/api.js'

const signedOut = {
  state: 'signedOut',
  providerId: CODEX_PROVIDER_ID,
  oauthPluginPresent: true,
  credentialConfigured: false,
}

describe('createCodexAuthClient', () => {
  it('calls Typert methods with empty args', async () => {
    const call = vi.fn(async () => ({ ok: true, value: signedOut }))
    const api = createCodexAuthClient({ call } as never)
    await api.status()
    await api.login()
    expect(call).toHaveBeenCalledWith('/api', 'codexLoginDock/status', { args: {} })
    expect(call).toHaveBeenCalledWith('/api', 'codexLoginDock/login', { args: {} })
  })
})
