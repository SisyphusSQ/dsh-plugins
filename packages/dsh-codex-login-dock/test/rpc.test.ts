import assert from 'node:assert/strict'
import test from 'node:test'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, ResolvedCredential } from '@deepseek-ai/dsh-credentials'

import { createCodexLoginDockHost } from '../lib/host.js'
import {
  DEFAULT_ACCESS_TOKEN_REF,
  DEFAULT_OAUTH_CREDENTIAL_REF,
} from '../lib/protocol.js'
import { createCodexLoginDockRpc, CodexLoginDockRemote } from '../lib/rpc.js'
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

test('RPC status login and cancel stay secret-free without a live agent', async () => {
  const values: Record<string, ResolvedCredential | undefined> = {}
  const host = createCodexLoginDockHost({
    credentials: memoryStore(values),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    getOAuth: () => ({
      async loginBrowser() {
        values[oauthRef] = {
          value: JSON.stringify({
            type: 'oauth',
            access: ACCESS,
            refresh: REFRESH,
            expires: Date.now() + 60_000,
          }),
          source: 'file',
        }
      },
      async logout() {
        assert.fail('this test must not logout')
      },
    }),
  })
  const rpc = createCodexLoginDockRpc({ host })

  const signedOut = await rpc.status()
  assert.equal(signedOut.state, 'signedOut')

  const ready = await rpc.login()
  assert.equal(ready.state, 'ready')
  assert.equal(JSON.stringify(ready).includes(ACCESS), false)
  assert.equal(JSON.stringify(ready).includes(REFRESH), false)
})

test('RPC cancel aborts an in-flight login', async () => {
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
  const rpc = createCodexLoginDockRpc({ host })
  const started = rpc.login()
  const cancelled = await rpc.cancel()
  assert.equal(cancelled.errorCode, 'LOGIN_CANCELLED')
  const settled = await started
  assert.equal(settled.errorCode, 'LOGIN_CANCELLED')
  assert.equal(JSON.stringify(settled).includes(ACCESS), false)
})

test('RPC login without a live agent still starts silent PKCE', async () => {
  let calls = 0
  const values: Record<string, ResolvedCredential | undefined> = {}
  const host = createCodexLoginDockHost({
    credentials: memoryStore(values),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    getOAuth: () => ({
      async loginBrowser() {
        calls += 1
        values[oauthRef] = {
          value: JSON.stringify({
            type: 'oauth',
            access: ACCESS,
            refresh: REFRESH,
            expires: Date.now() + 60_000,
          }),
          source: 'file',
        }
      },
      async logout() {
        assert.fail('this test must not logout')
      },
    }),
  })
  const rpc = createCodexLoginDockRpc({ host })
  const snapshot = await rpc.login()
  assert.equal(calls, 1)
  assert.equal(snapshot.state, 'ready')
})

test('RPC logout calls silent logout and stays secret-free', async () => {
  const values: Record<string, ResolvedCredential | undefined> = {
    [oauthRef]: {
      value: JSON.stringify({
        type: 'oauth',
        access: ACCESS,
        refresh: REFRESH,
        expires: Date.now() + 60_000,
      }),
      source: 'file',
    },
  }
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
  const rpc = createCodexLoginDockRpc({ host })
  const snapshot = await rpc.logout()
  assert.equal(calls, 1)
  assert.equal(snapshot.state, 'signedOut')
  assert.equal(JSON.stringify(snapshot).includes(ACCESS), false)
  assert.equal(JSON.stringify(snapshot).includes(REFRESH), false)
})

test('Typert SRC reflection does not advertise sessionId on silent methods', () => {
  const names = (implementation: (...args: never[]) => unknown): string[] => {
    const source = Function.prototype.toString.call(implementation)
    const open = source.indexOf('(')
    const close = source.indexOf(')', open + 1)
    const body = source.slice(open + 1, close).trim()
    return body.length === 0 ? [] : body.split(',').map((part) => part.trim())
  }
  for (const method of ['status', 'login', 'cancel', 'logout'] as const) {
    assert.deepEqual(names(CodexLoginDockRemote.prototype[method]), [])
  }
})
