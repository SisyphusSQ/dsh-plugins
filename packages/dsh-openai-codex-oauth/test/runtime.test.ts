import assert from 'node:assert/strict'
import test from 'node:test'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { AuthInteraction, OAuthCredential } from '@earendil-works/pi-ai'

import {
  CALLBACK_PORT_BUSY_MESSAGE,
  LOGIN_IN_PROGRESS_MESSAGE,
  createCodexOAuthRuntime,
  DEFAULT_ACCESS_TOKEN_REF,
  DEFAULT_OAUTH_CREDENTIAL_REF,
} from '../lib/runtime.js'
import type { CredentialStore } from '../lib/runtime.js'

const ACCESS = 'test-access-token-aaa-secret'
const REFRESH = 'test-refresh-token-bbb-secret'
const oauthRef = credentialRef(DEFAULT_OAUTH_CREDENTIAL_REF)
const accessRef = credentialRef(DEFAULT_ACCESS_TOKEN_REF)

function memoryStore(values: Record<string, { value: string; source?: string } | undefined> = {}): CredentialStore {
  return {
    async resolve(ref: CredentialRef) {
      return values[ref]
    },
    async describe(ref: CredentialRef) {
      const hit = values[ref]
      if (hit === undefined) return { configured: false, writable: true }
      return { configured: true, writable: true, source: hit.source }
    },
    async set(ref: CredentialRef, value: string) {
      values[ref] = { value, source: 'file' }
    },
    async unset(ref: CredentialRef) {
      delete values[ref]
    },
  }
}

function credential(): OAuthCredential {
  return {
    type: 'oauth',
    access: ACCESS,
    refresh: REFRESH,
    expires: Date.now() + 60_000,
  }
}

test('loginBrowser opens the URL, persists credentials, and stays secret-free in the runtime return', async () => {
  const values: Record<string, { value: string; source?: string } | undefined> = {}
  const opened: string[] = []
  const runtime = createCodexOAuthRuntime({
    credentials: memoryStore(values),
    openUrl: async (url) => {
      opened.push(url)
    },
    ensureCallbackPort: async () => undefined,
    oauth: {
      async login(interaction: AuthInteraction) {
        interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/oauth/authorize?x=1' })
        void interaction.prompt({
          type: 'manual_code',
          message: 'wait',
          signal: new AbortController().signal,
        }).catch(() => undefined)
        return credential()
      },
      async refresh() {
        assert.fail('refresh must not run during login')
        return credential()
      },
    },
  })

  await runtime.loginBrowser()
  assert.deepEqual(opened, ['https://auth.openai.com/oauth/authorize?x=1'])
  assert.equal(values[oauthRef]?.value.includes(ACCESS), true)
  assert.equal(values[accessRef]?.value, ACCESS)
})

test('loginBrowser abort rejects with login cancelled and does not persist', async () => {
  const values: Record<string, { value: string; source?: string } | undefined> = {}
  const user = new AbortController()
  const runtime = createCodexOAuthRuntime({
    credentials: memoryStore(values),
    openUrl: async () => undefined,
    ensureCallbackPort: async () => undefined,
    oauth: {
      async login(interaction: AuthInteraction) {
        interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/oauth/authorize?x=1' })
        return interaction.prompt({
          type: 'manual_code',
          message: 'wait',
          signal: new AbortController().signal,
        }).then(() => credential())
      },
      async refresh() {
        return credential()
      },
    },
  })

  const pending = runtime.loginBrowser(user.signal)
  await Promise.resolve()
  user.abort()
  await assert.rejects(pending, /login cancelled/)
  assert.equal(values[oauthRef], undefined)
})

test('a second loginBrowser while one is in flight throws LOGIN_IN_PROGRESS', async () => {
  let release: (() => void) | undefined
  const gate = new Promise<OAuthCredential>((resolve) => {
    release = () => resolve(credential())
  })
  const runtime = createCodexOAuthRuntime({
    credentials: memoryStore(),
    openUrl: async () => undefined,
    ensureCallbackPort: async () => undefined,
    oauth: {
      async login() {
        return gate
      },
      async refresh() {
        return credential()
      },
    },
  })

  const first = runtime.loginBrowser()
  await Promise.resolve()
  await assert.rejects(runtime.loginBrowser(), (error: unknown) => {
    assert.equal(error instanceof Error && error.message, LOGIN_IN_PROGRESS_MESSAGE)
    return true
  })
  release?.()
  await first
})

test('ensureCallbackPort failure maps to the 1455 busy message', async () => {
  const runtime = createCodexOAuthRuntime({
    credentials: memoryStore(),
    openUrl: async () => {
      assert.fail('must not open a browser when the callback port is busy')
    },
    ensureCallbackPort: async () => {
      throw new Error(CALLBACK_PORT_BUSY_MESSAGE)
    },
    oauth: {
      async login() {
        assert.fail('must not start PKCE when the callback port is busy')
        return credential()
      },
      async refresh() {
        return credential()
      },
    },
  })
  await assert.rejects(runtime.loginBrowser(), /EADDRINUSE 127.0.0.1:1455/)
})

test('logout clears both credential refs', async () => {
  const values: Record<string, { value: string; source?: string } | undefined> = {
    [oauthRef]: { value: JSON.stringify(credential()), source: 'file' },
    [accessRef]: { value: ACCESS, source: 'file' },
  }
  const runtime = createCodexOAuthRuntime({
    credentials: memoryStore(values),
    openUrl: async () => undefined,
    ensureCallbackPort: async () => undefined,
    oauth: {
      async login() {
        return credential()
      },
      async refresh() {
        return credential()
      },
    },
  })
  await runtime.logout()
  assert.equal(values[oauthRef], undefined)
  assert.equal(values[accessRef], undefined)
})
