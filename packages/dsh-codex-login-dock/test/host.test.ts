import assert from 'node:assert/strict'
import test from 'node:test'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandExecution, CommandId } from '@deepseek-ai/dsh-commands'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, ResolvedCredential } from '@deepseek-ai/dsh-credentials'

import { createCodexLoginDockHost } from '../lib/host.js'
import {
  DEFAULT_ACCESS_TOKEN_REF,
  DEFAULT_LOGIN_LINE,
  DEFAULT_LOGOUT_LINE,
  DEFAULT_OAUTH_CREDENTIAL_REF,
} from '../lib/protocol.js'
import type { CredentialStore } from '../lib/status.js'

const ACCESS = 'test-access-token-aaa-secret'
const REFRESH = 'test-refresh-token-bbb-secret'
const oauthRef = credentialRef(DEFAULT_OAUTH_CREDENTIAL_REF)
const accessRef = credentialRef(DEFAULT_ACCESS_TOKEN_REF)
const agent = { session: { header: { id: 'session-1' } } } as unknown as Agent

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

test('startBrowserLogin delegates to /codex-login browser and rereads status', async () => {
  const values: Record<string, ResolvedCredential | undefined> = {}
  const lines: string[] = []
  const host = createCodexLoginDockHost({
    credentials: memoryStore(values),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    findLoginCommand: () => true,
    executeCommand: async (_agent, line) => {
      lines.push(line)
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

  const snapshot = await host.startBrowserLogin(agent)
  assert.deepEqual(lines, [DEFAULT_LOGIN_LINE])
  assert.equal(snapshot.state, 'ready')
  assert.equal(JSON.stringify(snapshot).includes(ACCESS), false)
})

test('missing login command is missingPlugin', async () => {
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    findLoginCommand: () => false,
    executeCommand: async () => {
      assert.fail('must not start PKCE when the OAuth plugin is absent')
    },
  })
  const snapshot = await host.startBrowserLogin(agent)
  assert.equal(snapshot.state, 'missingPlugin')
  assert.equal(snapshot.errorCode, 'OAUTH_PLUGIN_MISSING')
})

test('port conflict maps to CALLBACK_PORT_BUSY without raw details', async () => {
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    findLoginCommand: () => true,
    executeCommand: async () => ({
      commandId: 'cmd-1' as CommandId,
      result: {
        kind: 'error',
        text: `listen EADDRINUSE 127.0.0.1:1455 token=${ACCESS}`,
      },
    }),
  })
  const snapshot = await host.startBrowserLogin(agent)
  assert.equal(snapshot.state, 'error')
  assert.equal(snapshot.errorCode, 'CALLBACK_PORT_BUSY')
  assert.equal(JSON.stringify(snapshot).includes(ACCESS), false)
  assert.equal(snapshot.errorMessage?.includes('1455'), true)
})

test('status is authorizing while login is in flight', async () => {
  let release: (() => void) | undefined
  const pending = new Promise<CommandExecution>((resolve) => {
    release = () => resolve({
      commandId: 'cmd-1' as CommandId,
      result: { kind: 'success', text: 'ok' },
    })
  })
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    findLoginCommand: () => true,
    executeCommand: async (_agent, _line, signal) => {
      if (signal.aborted) throw new Error('login cancelled')
      return pending
    },
  })

  const started = host.startBrowserLogin(agent)
  const mid = await host.status(agent)
  assert.equal(mid.state, 'authorizing')
  const second = await host.startBrowserLogin(agent)
  assert.equal(second.errorCode, 'LOGIN_IN_PROGRESS')
  release?.()
  const done = await started
  assert.equal(done.state, 'signedOut')
})

test('cancelLogin aborts the delegated login', async () => {
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

  const started = host.startBrowserLogin(agent)
  const mid = await host.status(agent)
  assert.equal(mid.state, 'authorizing')
  const cancelled = await host.cancelLogin()
  assert.equal(cancelled.errorCode, 'LOGIN_CANCELLED')
  const settled = await started
  assert.equal(settled.errorCode, 'LOGIN_CANCELLED')
})

test('logout delegates to /codex-logout and rereads a secret-free snapshot', async () => {
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

  const snapshot = await host.logout(agent)
  assert.deepEqual(lines, [DEFAULT_LOGOUT_LINE])
  assert.equal(snapshot.state, 'signedOut')
  assert.equal(JSON.stringify(snapshot).includes(ACCESS), false)
  assert.equal(JSON.stringify(snapshot).includes(REFRESH), false)
})

test('logout without the OAuth plugin is missingPlugin and does not run a command', async () => {
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    findLoginCommand: () => false,
    executeCommand: async () => {
      assert.fail('must not clear credentials when the OAuth plugin is absent')
    },
  })
  const snapshot = await host.logout(agent)
  assert.equal(snapshot.state, 'missingPlugin')
  assert.equal(snapshot.errorCode, 'OAUTH_PLUGIN_MISSING')
})

test('commands register secret-free status login and cancel', () => {
  const host = createCodexLoginDockHost({
    credentials: memoryStore({}),
    oauthCredentialRef: oauthRef,
    accessTokenRef: accessRef,
    findLoginCommand: () => true,
    executeCommand: async () => undefined,
  })
  assert.deepEqual(host.commands().map((command) => command.name), [
    'codex-auth-status',
    'codex-auth-login',
    'codex-auth-cancel',
    'codex-auth-logout',
  ])
})
