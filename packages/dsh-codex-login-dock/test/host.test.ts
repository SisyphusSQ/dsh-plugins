import assert from 'node:assert/strict'
import test from 'node:test'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, ResolvedCredential } from '@deepseek-ai/dsh-credentials'

import { createCodexLoginDockHost, type CodexOAuthSilent } from '../lib/host.js'
import {
  DEFAULT_ACCESS_TOKEN_REF,
  DEFAULT_OAUTH_CREDENTIAL_REF,
} from '../lib/protocol.js'
import type { CredentialStore } from '../lib/status.js'

const ACCESS = 'test-access-token-aaa-secret'
const REFRESH = 'test-refresh-token-bbb-secret'
const oauthRef = credentialRef(DEFAULT_OAUTH_CREDENTIAL_REF)
const accessRef = credentialRef(DEFAULT_ACCESS_TOKEN_REF)

function memoryStore(values: Record<string, ResolvedCredential | undefined>): CredentialStore {
  return {
    async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
      return values[ref]
    },
    async describe(ref: CredentialRef): Promise<CredentialInfo> {
      const hit = values[ref]
      if (hit === undefined) return { configured: false, writable: true }
      return { configured: true, writable: true, source: hit.source }
    },
  }
}

function persist(values: Record<string, ResolvedCredential | undefined>): void {
  values[oauthRef] = {
    value: JSON.stringify({
      type: 'oauth',
      access: ACCESS,
      refresh: REFRESH,
      expires: Date.now() + 60_000,
    }),
    source: 'file',
  }
}

test('startBrowserLogin calls silent loginBrowser and rereads status', async () => {
  const values: Record<string, ResolvedCredential | undefined> = {}
  let calls = 0
  const host = createCodexLoginDockHost({
    credentials: memoryStore(values),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    getOAuth: (): CodexOAuthSilent => ({
      async loginBrowser() {
        calls += 1
        persist(values)
      },
      async logout() {
        assert.fail('login must not logout')
      },
    }),
  })

  const snapshot = await host.startBrowserLogin()
  assert.equal(calls, 1)
  assert.equal(snapshot.state, 'ready')
  assert.equal(JSON.stringify(snapshot).includes(ACCESS), false)
})

test('missing silent service is missingPlugin', async () => {
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    getOAuth: () => undefined,
  })
  const snapshot = await host.startBrowserLogin()
  assert.equal(snapshot.state, 'missingPlugin')
  assert.equal(snapshot.errorCode, 'OAUTH_PLUGIN_MISSING')
})

test('port conflict maps to CALLBACK_PORT_BUSY without raw details', async () => {
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    getOAuth: () => ({
      async loginBrowser() {
        throw new Error(`listen EADDRINUSE 127.0.0.1:1455 token=${ACCESS}`)
      },
      async logout() {
        assert.fail('port conflict must not logout')
      },
    }),
  })
  const snapshot = await host.startBrowserLogin()
  assert.equal(snapshot.state, 'error')
  assert.equal(snapshot.errorCode, 'CALLBACK_PORT_BUSY')
  assert.equal(JSON.stringify(snapshot).includes(ACCESS), false)
  assert.equal(snapshot.errorMessage?.includes('1455'), true)
})

test('status is authorizing while login is in flight', async () => {
  let release: (() => void) | undefined
  const pending = new Promise<void>((resolve) => {
    release = () => resolve()
  })
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    getOAuth: () => ({
      async loginBrowser(signal) {
        if (signal?.aborted === true) throw new Error('login cancelled')
        return pending
      },
      async logout() {
        assert.fail('in-flight login must not logout')
      },
    }),
  })

  const started = host.startBrowserLogin()
  const mid = await host.status()
  assert.equal(mid.state, 'authorizing')
  const second = await host.startBrowserLogin()
  assert.equal(second.errorCode, 'LOGIN_IN_PROGRESS')
  release?.()
  const done = await started
  assert.equal(done.state, 'signedOut')
})

test('cancelLogin aborts the silent login', async () => {
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    getOAuth: () => ({
      async loginBrowser(signal) {
        if (signal?.aborted === true) throw new Error('login cancelled')
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('login cancelled')), { once: true })
        })
      },
      async logout() {
        assert.fail('cancel must not logout')
      },
    }),
  })

  const started = host.startBrowserLogin()
  const mid = await host.status()
  assert.equal(mid.state, 'authorizing')
  const cancelled = await host.cancelLogin()
  assert.equal(cancelled.errorCode, 'LOGIN_CANCELLED')
  const settled = await started
  assert.equal(settled.errorCode, 'LOGIN_CANCELLED')
})

test('logout calls silent logout and rereads a secret-free snapshot', async () => {
  const values: Record<string, ResolvedCredential | undefined> = {}
  persist(values)
  let calls = 0
  const host = createCodexLoginDockHost({
    credentials: memoryStore(values),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    getOAuth: () => ({
      async loginBrowser() {
        assert.fail('logout must not login')
      },
      async logout() {
        calls += 1
        delete values[oauthRef]
      },
    }),
  })

  const snapshot = await host.logout()
  assert.equal(calls, 1)
  assert.equal(snapshot.state, 'signedOut')
  assert.equal(JSON.stringify(snapshot).includes(ACCESS), false)
  assert.equal(JSON.stringify(snapshot).includes(REFRESH), false)
})

test('logout without the OAuth plugin is missingPlugin and does not clear credentials', async () => {
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    getOAuth: () => undefined,
  })
  const snapshot = await host.logout()
  assert.equal(snapshot.state, 'missingPlugin')
  assert.equal(snapshot.errorCode, 'OAUTH_PLUGIN_MISSING')
})

test('commands register secret-free status login and cancel', () => {
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    getOAuth: () => ({
      async loginBrowser() {},
      async logout() {},
    }),
  })
  assert.deepEqual(host.commands().map((command) => command.name), [
    'codex-auth-status',
    'codex-auth-login',
    'codex-auth-cancel',
    'codex-auth-logout',
  ])
})
