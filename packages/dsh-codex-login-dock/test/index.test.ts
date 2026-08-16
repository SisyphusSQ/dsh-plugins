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
    plugin: (entry: unknown, config: unknown) => {
      plugins.push({ entry, config })
    },
  } as unknown as Context

  apply(context)
  assert.equal(name, 'codex-login-dock')
  assert.deepEqual(inject, ['commands', 'credentials', 'agents'])
  assert.deepEqual(registered.map((definition) => definition.name), [
    'codex-auth-status',
    'codex-auth-login',
    'codex-auth-cancel',
    'codex-auth-logout',
  ])
  assert.equal(plugins.length, 1)
})

test('Cordis loader sees named plugin metadata instead of an unannotated default export', () => {
  assert.equal('default' in plugin, false)
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(plugin.inject, inject)
  assert.equal(plugin.Config !== undefined, true)
})
