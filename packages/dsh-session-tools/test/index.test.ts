import assert from 'node:assert/strict'
import test from 'node:test'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { HarnessError, type CallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { TypertLookupFailure } from '@deepseek-ai/dsh-typert-protocol'
import * as plugin from '../lib/index.js'
import { apply, inject, name } from '../lib/index.js'
import { defaultSessionToolsConfig } from '../lib/tools.js'

test('apply registers the complete six-tool surface', () => {
  const registered: ToolDefinition[] = []
  const events: string[] = []
  const context = {
    tools: {
      register: (definition: ToolDefinition) => {
        registered.push(definition)
        return () => undefined
      },
    },
    agents: {},
    approval: {},
    apiProxy: { sessions: {} },
    sessionQuery: {},
    sessionReferenceResolver: {},
    typert: { lookups: { get: () => undefined } },
    on: (event: string) => {
      events.push(event)
      return () => undefined
    },
  } as unknown as Context

  apply(context, defaultSessionToolsConfig)
  assert.deepEqual(events, ['agent/pre-step'])

  assert.equal(name, 'session-tools')
  assert.deepEqual(inject, [
    'tools',
    'agents',
    'approval',
    'apiProxy',
    'sessionQuery',
    'sessionReferenceResolver',
    'typert',
  ])
  assert.deepEqual(registered.map((definition) => definition.name), [
    'list_sessions',
    'read_session',
    'create_session',
    'rename_session',
    'fork_session',
    'send_message_to_session',
  ])
})

test('Cordis loader sees named plugin metadata instead of an unannotated default export', () => {
  assert.equal('default' in plugin, false)
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(plugin.inject, inject)
  assert.equal(plugin.Config !== undefined, true)
})

test('Typert agent lookup policy failures become stable Harness tool errors', async () => {
  const registered: ToolDefinition[] = []
  const caller = {
    id: SessionId('caller'),
    status: 'running',
  } as unknown as Agent
  const context = {
    tools: { register: (definition: ToolDefinition) => registered.push(definition) },
    agents: {
      get: () => caller,
      currentInitiator: () => caller,
      roots: () => [caller],
    },
    approval: { request: async () => 'allowed-once' },
    apiProxy: { sessions: {} },
    sessionQuery: {},
    sessionReferenceResolver: {},
    typert: {
      lookups: {
        get: () => ({
          resolve: async () => {
            throw new TypertLookupFailure({
              code: 'session-not-found',
              message: 'target session not found',
              details: { sessionId: 'missing' },
            })
          },
        }),
      },
    },
    on: () => undefined,
  } as unknown as Context
  apply(context, defaultSessionToolsConfig)
  const send = registered.find((definition) => definition.name === 'send_message_to_session')
  assert.ok(send)
  const execution = {
    callId: 'call-lookup' as CallId,
    rootCallId: 'call-lookup' as CallId,
    name: 'send_message_to_session',
    arguments: {},
    agent: caller,
    signal: new AbortController().signal,
    token: Symbol('execution') as ToolRunContext['token'],
    deferContext: () => undefined,
    concludeTurn: () => undefined,
  } satisfies ToolRunContext

  await assert.rejects(
    send.execute({ session_id: 'missing', message: 'hello' }, execution),
    (error: unknown) => error instanceof HarnessError
      && error.code === 'SESSION_TOOLS_LOOKUP_SESSION_NOT_FOUND',
  )
})
