import assert from 'node:assert/strict'
import test from 'node:test'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

import * as plugin from '../lib/index.js'
import { apply, inject, name, OPENAI_CODEX_OAUTH_SERVICE } from '../lib/index.js'

test('apply registers slash commands and the silent Host service', () => {
  const registered: CommandDefinition[] = []
  const plugins: unknown[] = []
  const events: string[] = []
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
      set: async () => undefined,
      unset: async () => undefined,
    },
    userQuestions: {
      ask: async () => {
        throw new Error('slash login tests must not reach userQuestions')
      },
    },
    logger: { info() {}, warn() {} },
    plugin: (entry: unknown, config: unknown) => {
      plugins.push({ entry, config })
    },
    on: (event: string) => {
      events.push(event)
      return () => undefined
    },
  } as unknown as Context

  apply(context)
  assert.equal(name, 'openai-codex-oauth')
  assert.deepEqual(inject, ['commands', 'credentials', 'userQuestions'])
  assert.deepEqual(registered.map((definition) => definition.name), [
    'codex-login',
    'codex-logout',
    'codex-status',
  ])
  assert.equal(plugins.length, 1)
  assert.equal(events.includes('agent/request'), true)
  const first = plugins[0] as { entry: { name?: string } }
  assert.equal(first.entry.name, 'OpenAICodexOAuthService')
})

test('Cordis loader sees named plugin metadata instead of an unannotated default export', () => {
  assert.equal('default' in plugin, false)
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(plugin.inject, inject)
  assert.equal(plugin.Config !== undefined, true)
  assert.equal(plugin.OPENAI_CODEX_OAUTH_SERVICE, OPENAI_CODEX_OAUTH_SERVICE)
})
