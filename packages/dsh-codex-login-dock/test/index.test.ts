import assert from 'node:assert/strict'
import test from 'node:test'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

import * as plugin from '../lib/index.js'
import { apply, inject, name } from '../lib/index.js'

test('apply registers the host commands', () => {
  const registered: CommandDefinition[] = []
  const plugins: unknown[] = []
  const context = {
    commands: {
      register: (definition: CommandDefinition) => {
        registered.push(definition)
        return () => undefined
      },
      find: () => undefined,
      execute: async () => undefined,
    },
    credentials: {
      resolve: async () => undefined,
      describe: async () => ({ configured: false, writable: true }),
    },
    agents: {
      get: () => undefined,
      list: () => [],
    },
    openaiCodexOAuth: undefined,
    inject: (_deps: unknown, _callback: (inner: unknown) => unknown) => ({}) as unknown,
    plugin: (entry: unknown, config: unknown) => {
      plugins.push({ entry, config })
    },
  } as unknown as Context

  apply(context)
  assert.equal(name, 'codex-login-dock')
  assert.deepEqual(inject, ['commands', 'credentials'])
  assert.deepEqual(registered.map((definition) => definition.name), [
    'codex-auth-status',
    'codex-auth-login',
    'codex-auth-cancel',
    'codex-auth-logout',
  ])
  assert.equal(plugins.length, 1)
})

test('apply waits for openaiCodexOAuth without requiring it at load time', () => {
  const registered: CommandDefinition[] = []
  let injected: unknown
  const context = {
    commands: {
      register: (definition: CommandDefinition) => {
        registered.push(definition)
        return () => undefined
      },
    },
    credentials: {
      resolve: async () => undefined,
      describe: async () => ({ configured: false, writable: true }),
    },
    inject: (deps: unknown, callback: (inner: unknown) => unknown) => {
      injected = deps
      callback({
        openaiCodexOAuth: {
          loginBrowser: async () => undefined,
          logout: async () => undefined,
        },
      })
      return {} as unknown
    },
    plugin: () => undefined,
  } as unknown as Context

  apply(context)
  assert.deepEqual(injected, ['openaiCodexOAuth'])
  assert.equal(registered.length, 4)
})

test('Cordis loader sees named plugin metadata instead of an unannotated default export', () => {
  assert.equal('default' in plugin, false)
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(plugin.inject, inject)
  assert.equal(plugin.Config !== undefined, true)
})
