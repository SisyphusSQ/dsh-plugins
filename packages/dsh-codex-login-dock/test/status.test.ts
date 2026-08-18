import assert from 'node:assert/strict'
import test from 'node:test'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, ResolvedCredential } from '@deepseek-ai/dsh-credentials'

import {
  DEFAULT_ACCESS_TOKEN_REF,
  DEFAULT_OAUTH_CREDENTIAL_REF,
  formatAuthSnapshot,
  parseAuthSnapshot,
  redactCredentialText,
  snapshotContainsForbiddenMaterial,
} from '../lib/protocol.js'
import { readCodexAuthStatus, type CredentialStore } from '../lib/status.js'

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

function oauthJson(overrides: { access?: string; refresh?: string; expires?: number } = {}): string {
  return JSON.stringify({
    type: 'oauth',
    access: overrides.access ?? ACCESS,
    refresh: overrides.refresh ?? REFRESH,
    expires: overrides.expires ?? Date.now() + 60_000,
    accountId: 'acct_test',
  })
}

test('signedOut when no credentials are configured', async () => {
  const snapshot = await readCodexAuthStatus({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    oauthPluginPresent: true,
  })
  assert.equal(snapshot.state, 'signedOut')
  assert.equal(snapshot.credentialConfigured, false)
  assert.equal(snapshotContainsForbiddenMaterial(snapshot, [ACCESS, REFRESH]), false)
})

test('missingPlugin does not pretend it can log in', async () => {
  const snapshot = await readCodexAuthStatus({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    oauthPluginPresent: false,
  })
  assert.equal(snapshot.state, 'missingPlugin')
  assert.equal(snapshot.errorCode, 'OAUTH_PLUGIN_MISSING')
  assert.match(snapshot.errorMessage ?? '', /dsh-openai-codex-oauth/)
})

test('ready when refresh remains even if access already expired', async () => {
  const expires = Date.now() - 5_000
  const snapshot = await readCodexAuthStatus({
    credentials: memoryStore({
      [oauthRef]: { value: oauthJson({ expires }), source: 'file' },
    }),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    oauthPluginPresent: true,
  })
  assert.equal(snapshot.state, 'ready')
  assert.equal(snapshot.expiresAt, expires)
})

test('ready when only the access token credential is configured', async () => {
  const snapshot = await readCodexAuthStatus({
    credentials: memoryStore({
      [accessRef]: { value: ACCESS, source: 'file' },
    }),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    oauthPluginPresent: true,
  })
  assert.equal(snapshot.state, 'ready')
  assert.equal(snapshotContainsForbiddenMaterial(snapshot, [ACCESS]), false)
})

test('ready snapshot keeps expiry and drops token material', async () => {
  const expires = Date.now() + 120_000
  const snapshot = await readCodexAuthStatus({
    credentials: memoryStore({
      [oauthRef]: { value: oauthJson({ expires }), source: 'file' },
    }),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    oauthPluginPresent: true,
  })
  assert.equal(snapshot.state, 'ready')
  assert.equal(snapshot.expiresAt, expires)
  assert.equal(snapshot.credentialSource, 'file')
  assert.equal(snapshotContainsForbiddenMaterial(snapshot, [ACCESS, REFRESH, 'acct_test']), false)
  assert.equal(formatAuthSnapshot(snapshot).includes(ACCESS), false)
})

test('parseAuthSnapshot copies only secret-free known fields', () => {
  const snapshot = parseAuthSnapshot({
    state: 'ready',
    providerId: 'openai-codex',
    oauthPluginPresent: true,
    credentialConfigured: true,
    expiresAt: 1,
    access: ACCESS,
    refresh: REFRESH,
  })
  assert.equal(snapshot?.state, 'ready')
  assert.equal(snapshot?.expiresAt, 1)
  assert.equal(JSON.stringify(snapshot).includes(ACCESS), false)
  assert.equal(parseAuthSnapshot({ state: 'ready', providerId: 'other' }), undefined)
})

test('expired when refresh token is missing', async () => {
  const snapshot = await readCodexAuthStatus({
    credentials: memoryStore({
      [oauthRef]: {
        value: JSON.stringify({ type: 'oauth', access: ACCESS, refresh: '', expires: Date.now() }),
        source: 'file',
      },
    }),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    oauthPluginPresent: true,
  })
  assert.equal(snapshot.state, 'expired')
  assert.equal(snapshot.errorCode, 'AUTH_EXPIRED')
  assert.equal(snapshotContainsForbiddenMaterial(snapshot, [ACCESS]), false)
})

test('invalid JSON becomes error without echoing the blob', async () => {
  const blob = '{"access":' + JSON.stringify(ACCESS) + ',"refresh":' + JSON.stringify(REFRESH)
  const snapshot = await readCodexAuthStatus({
    credentials: memoryStore({
      [oauthRef]: { value: blob, source: 'file' },
    }),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    oauthPluginPresent: true,
  })
  assert.equal(snapshot.state, 'error')
  assert.equal(snapshot.errorCode, 'INVALID_CREDENTIAL')
  assert.equal(snapshotContainsForbiddenMaterial(snapshot, [ACCESS, REFRESH]), false)
})

test('authorizing wins over stored credentials', async () => {
  const snapshot = await readCodexAuthStatus({
    credentials: memoryStore({
      [oauthRef]: { value: oauthJson(), source: 'file' },
    }),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    oauthPluginPresent: true,
    authorizing: true,
  })
  assert.equal(snapshot.state, 'authorizing')
  assert.equal(snapshot.credentialConfigured, false)
})

test('redactCredentialText strips JWTs and JSON token fields', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc'
  const text = redactCredentialText(
    `failed ${jwt} body {"access":"${ACCESS}","refresh":"${REFRESH}"}`,
    [ACCESS],
  )
  assert.equal(text.includes(jwt), false)
  assert.equal(text.includes(ACCESS), false)
  assert.equal(text.includes(REFRESH), false)
  assert.match(text, /\[redacted-jwt\]/)
})
