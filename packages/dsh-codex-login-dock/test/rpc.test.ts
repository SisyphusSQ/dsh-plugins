import assert from 'node:assert/strict'
import test from 'node:test'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandExecution, CommandId } from '@deepseek-ai/dsh-commands'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, ResolvedCredential } from '@deepseek-ai/dsh-credentials'

import { createCodexLoginDockHost } from '../lib/host.js'
import {
  DEFAULT_ACCESS_TOKEN_REF,
  DEFAULT_OAUTH_CREDENTIAL_REF,
  DEFAULT_LOGOUT_LINE,
  SESSION_UNAVAILABLE_MESSAGE,
} from '../lib/protocol.js'
import { createCodexLoginDockRpc } from '../lib/rpc.js'
import type { CredentialStore } from '../lib/status.js'

const ACCESS = 'test-access-token-aaa-secret'
const REFRESH = 'test-refresh-token-bbb-secret'
const oauthRef = credentialRef(DEFAULT_OAUTH_CREDENTIAL_REF)
const accessRef = credentialRef(DEFAULT_ACCESS_TOKEN_REF)
const agent = { id: 'session-1', session: { header: { id: 'session-1' } } } as unknown as Agent

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

test('RPC status login and cancel stay secret-free and session-scoped', async () => {
  const values: Record<string, ResolvedCredential | undefined> = {}
  const host = createCodexLoginDockHost({
    credentials: memoryStore(values),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    findLoginCommand: () => true,
    executeCommand: async (_agent, _line, signal) => {
      if (signal.aborted) throw new Error('login cancelled')
      values[oauthRef] = {
        value: JSON.stringify({
          type: 'oauth',
          access: ACCESS,
          refresh: REFRESH,
          expires: Date.now() + 60_000,
        }),
        source: 'file',
      }
      return {
        commandId: 'cmd-1' as CommandId,
        result: { kind: 'success', text: `logged in ${ACCESS}` },
      } satisfies CommandExecution
    },
  })
  const rpc = createCodexLoginDockRpc({
    host,
    getAgent: (sessionId) => sessionId === 'session-1' ? agent : undefined,
    listAgents: () => [],
  })

  const missing = await rpc.status('missing')
  assert.equal(missing.state, 'error')
  assert.equal(missing.errorCode, 'LOGIN_FAILED')
  assert.equal(missing.errorMessage, SESSION_UNAVAILABLE_MESSAGE)

  const signedOut = await rpc.status('session-1')
  assert.equal(signedOut.state, 'signedOut')

  const ready = await rpc.login('session-1')
  assert.equal(ready.state, 'ready')
  assert.equal(JSON.stringify(ready).includes(ACCESS), false)
  assert.equal(JSON.stringify(ready).includes(REFRESH), false)
})

test('RPC cancel aborts an in-flight login', async () => {
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    findLoginCommand: () => true,
    executeCommand: async (_agent, _line, signal) => {
      if (signal.aborted) throw new Error('login cancelled')
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('login cancelled')), { once: true })
      })
      return undefined
    },
  })
  const rpc = createCodexLoginDockRpc({
    host,
    getAgent: () => agent,
    listAgents: () => [agent],
  })
  const started = rpc.login('session-1')
  const cancelled = await rpc.cancel('session-1')
  assert.equal(cancelled.errorCode, 'LOGIN_CANCELLED')
  const settled = await started
  assert.equal(settled.errorCode, 'LOGIN_CANCELLED')
  assert.equal(JSON.stringify(settled).includes(ACCESS), false)
})

test('RPC status falls back to another live agent when the session is missing', async () => {
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    findLoginCommand: () => true,
    executeCommand: async () => {
      assert.fail('status must not start a command')
    },
  })
  const rpc = createCodexLoginDockRpc({
    host,
    getAgent: () => undefined,
    listAgents: () => [agent],
  })
  const snapshot = await rpc.status('')
  assert.equal(snapshot.state, 'signedOut')
})

test('RPC login without a live agent fails visibly and does not start PKCE', async () => {
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    findLoginCommand: () => true,
    executeCommand: async () => {
      assert.fail('must not start PKCE without a live agent')
    },
  })
  const rpc = createCodexLoginDockRpc({
    host,
    getAgent: () => undefined,
    listAgents: () => [],
  })
  const snapshot = await rpc.login('')
  assert.equal(snapshot.state, 'error')
  assert.equal(snapshot.errorCode, 'LOGIN_FAILED')
  assert.equal(snapshot.errorMessage, SESSION_UNAVAILABLE_MESSAGE)
})

test('RPC logout delegates to /codex-logout and stays secret-free', async () => {
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
  const lines: string[] = []
  const host = createCodexLoginDockHost({
    credentials: memoryStore(values),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    findLoginCommand: () => true,
    executeCommand: async (_agent, line) => {
      lines.push(line)
      delete values[oauthRef]
      return {
        commandId: 'cmd-logout' as CommandId,
        result: { kind: 'success', text: `logged out ${ACCESS}` },
      } satisfies CommandExecution
    },
  })
  const rpc = createCodexLoginDockRpc({
    host,
    getAgent: () => undefined,
    listAgents: () => [agent],
  })
  const snapshot = await rpc.logout('')
  assert.deepEqual(lines, [DEFAULT_LOGOUT_LINE])
  assert.equal(snapshot.state, 'signedOut')
  assert.equal(JSON.stringify(snapshot).includes(ACCESS), false)
  assert.equal(JSON.stringify(snapshot).includes(REFRESH), false)
})
