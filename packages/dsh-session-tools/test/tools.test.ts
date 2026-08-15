import assert from 'node:assert/strict'
import test from 'node:test'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type CallId, type UserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import {
  createSessionToolDefinitions,
  defaultSessionToolsConfig,
  type SessionToolServices,
} from '../lib/tools.js'

function header(id: string, overrides: Partial<SessionHeader> = {}): SessionHeader {
  return {
    version: 0,
    id: SessionId(id),
    createdAt: 1,
    ...overrides,
  }
}

function agent(id: string, sessionHeader: SessionHeader = header(id)): Agent {
  const value = {
    id: SessionId(id),
    status: 'running',
    options: {},
    session: { header: sessionHeader },
  }
  return value as unknown as Agent
}

function execution(caller: Agent, name: string): ToolRunContext {
  return {
    callId: 'call-1' as CallId,
    rootCallId: 'call-1' as CallId,
    name,
    arguments: {},
    agent: caller,
    signal: new AbortController().signal,
    token: Symbol('execution') as ToolRunContext['token'],
    deferContext: () => undefined,
    concludeTurn: () => undefined,
  }
}

function tool(definitions: readonly ToolDefinition[], name: string): ToolDefinition {
  const definition = definitions.find((candidate) => candidate.name === name)
  assert.ok(definition, `tool ${name} must be registered`)
  return definition
}

function baseServices(caller: Agent): SessionToolServices {
  return {
    agents: {
      get: () => caller,
      currentInitiator: () => caller,
      roots: () => [caller],
    },
    approval: { request: async () => 'allowed-once' },
    sessionQuery: {
      listSessions: async () => [],
      readTitleSnapshots: async () => [],
    },
    sessionReferenceResolver: { prepare: async () => ({ content: [] }) },
    sessionsApi: {
      create: async () => { throw new Error('not used') },
      rename: async () => { throw new Error('not used') },
      fork: async () => { throw new Error('not used') },
    },
    resolveAgent: async () => undefined,
  }
}

test('list_sessions returns bounded ordinary-session metadata without approval', async () => {
  const caller = agent('current', header('current', { cwd: '/repo', createdAt: 3 }))
  let approvalRequests = 0
  const services = {
    agents: {
      get: () => caller,
      currentInitiator: () => caller,
      roots: () => [caller],
    },
    approval: {
      request: async () => {
        approvalRequests += 1
        return 'allowed-once' as const
      },
    },
    sessionQuery: {
      listSessions: async () => [
        { header: caller.session.header, live: true, persisted: true },
        { header: header('child', { origin: 'subagent' }), live: true, persisted: true },
      ],
      readTitleSnapshots: async () => [],
    },
    sessionReferenceResolver: {
      prepare: async () => ({ content: [] }),
    },
    sessionsApi: {
      create: async () => { throw new Error('not used') },
      rename: async () => { throw new Error('not used') },
      fork: async () => { throw new Error('not used') },
    },
    resolveAgent: async () => undefined,
  } satisfies SessionToolServices
  const definitions = createSessionToolDefinitions(services, defaultSessionToolsConfig)

  const value = await tool(definitions, 'list_sessions').execute(
    { query: '', limit: 50 },
    execution(caller, 'list_sessions'),
  )

  assert.deepEqual(value, {
    sessions: [{
      sessionId: 'current',
      title: 'current',
      cwd: '/repo',
      createdAt: 3,
      live: true,
      persisted: true,
      current: true,
    }],
    count: 1,
  })
  assert.equal(approvalRequests, 0)
})

test('read_session defers one sourced snapshot after approval without copying its text into the result', async () => {
  const caller = agent('current')
  const services = baseServices(caller)
  const requested: string[] = []
  services.approval = {
    request: async () => {
      requested.push('approval')
      return 'allowed-once'
    },
  }
  services.sessionReferenceResolver = {
    prepare: async (_agent, _content, references) => {
      requested.push(references[0]?.sessionId ?? '')
      return {
        content: [],
        additionalContext: createUserMessage({
          content: [{ type: 'text', text: 'UNTRUSTED SNAPSHOT BODY' }],
          source: {
            kind: 'session-reference',
            form: 'recall',
            version: 1,
            references: [{
              sessionId: 'source',
              label: 'Source session',
              capturedThroughSeq: 9,
              compacted: false,
              originalMessages: 4,
              retainedMessages: 3,
              omittedMessages: 1,
              omittedBytes: 12,
              truncated: true,
              inputIndex: 0,
            }],
          },
        }),
      }
    },
  }
  const definitions = createSessionToolDefinitions(services, defaultSessionToolsConfig)
  const deferred: UserMessage[] = []
  const exec = execution(caller, 'read_session')
  exec.deferContext = (context) => deferred.push(context)

  const value = await tool(definitions, 'read_session').execute(
    { session_id: 'source' },
    exec,
  )

  assert.deepEqual(requested, ['approval', 'source'])
  assert.equal(deferred.length, 1)
  assert.equal(deferred[0]?.source.kind, 'session-reference')
  assert.equal(deferred[0]?.content[0]?.type, 'text')
  assert.deepEqual(value, {
    sessionId: 'source',
    label: 'Source session',
    capturedThroughSeq: 9,
    compacted: false,
    originalMessages: 4,
    retainedMessages: 3,
    omittedMessages: 1,
    omittedBytes: 12,
    truncated: true,
  })
  assert.equal(JSON.stringify(value).includes('UNTRUSTED SNAPSHOT BODY'), false)
})

test('create_session asks approval and inherits cwd and agent preset through ApiProxy', async () => {
  const caller = agent('current', header('current', { cwd: '/caller/repo', agentPreset: 'code' }))
  const services = baseServices(caller)
  const calls: unknown[] = []
  services.approval = {
    request: async (request) => {
      calls.push({ approval: request.reason })
      return 'allowed-once'
    },
  }
  services.sessionsApi = {
    ...services.sessionsApi,
    create: async (request) => {
      calls.push({ create: request.payload })
      return {
        rpcId: request.rpcId,
        result: { ok: true, value: { sessionId: SessionId('created'), agentPreset: 'code' } },
      }
    },
  }
  const definitions = createSessionToolDefinitions(services, defaultSessionToolsConfig)

  const value = await tool(definitions, 'create_session').execute(
    {},
    execution(caller, 'create_session'),
  )

  assert.deepEqual(calls, [
    { approval: 'Create a new session in /caller/repo with agent preset code' },
    { create: { cwd: '/caller/repo', agentPreset: 'code' } },
  ])
  assert.deepEqual(value, { sessionId: 'created', cwd: '/caller/repo', agentPreset: 'code' })
})

test('rename_session renames the current session without approval by default', async () => {
  const caller = agent('current')
  const services = baseServices(caller)
  services.approval = { request: async () => { throw new Error('approval must not be requested') } }
  const requests: unknown[] = []
  services.sessionsApi = {
    ...services.sessionsApi,
    rename: async (request) => {
      requests.push(request.payload)
      return {
        rpcId: request.rpcId,
        result: { ok: true, value: { title: 'New title', seq: 7 } },
      }
    },
  }
  const definitions = createSessionToolDefinitions(services, defaultSessionToolsConfig)

  const value = await tool(definitions, 'rename_session').execute(
    { session_id: 'current', title: '  New title  ' },
    execution(caller, 'rename_session'),
  )

  assert.deepEqual(requests, [{ sessionId: 'current', title: '  New title  ' }])
  assert.deepEqual(value, { sessionId: 'current', title: 'New title', seq: 7 })
})

test('rename_session requires approval before renaming another session', async () => {
  const caller = agent('current')
  const services = baseServices(caller)
  const calls: string[] = []
  services.approval = {
    request: async (request) => {
      calls.push(request.reason ?? '')
      return 'allowed-once'
    },
  }
  services.sessionsApi = {
    ...services.sessionsApi,
    rename: async (request) => {
      calls.push(request.payload.sessionId)
      return {
        rpcId: request.rpcId,
        result: { ok: true, value: { title: 'Other title', seq: 4 } },
      }
    },
  }
  const definitions = createSessionToolDefinitions(services, defaultSessionToolsConfig)

  const value = await tool(definitions, 'rename_session').execute(
    { session_id: 'other', title: 'Other title' },
    execution(caller, 'rename_session'),
  )

  assert.deepEqual(calls, ['Rename session other to "Other title"', 'other'])
  assert.deepEqual(value, { sessionId: 'other', title: 'Other title', seq: 4 })
})

test('fork_session asks approval and delegates completed-turn selection to ApiProxy', async () => {
  const caller = agent('current')
  const services = baseServices(caller)
  const calls: unknown[] = []
  services.approval = {
    request: async (request) => {
      calls.push({ approval: request.reason })
      return 'allowed-once'
    },
  }
  services.sessionsApi = {
    ...services.sessionsApi,
    fork: async (request) => {
      calls.push({ fork: request.payload })
      return {
        rpcId: request.rpcId,
        result: { ok: true, value: { sessionId: SessionId('forked') } },
      }
    },
  }
  const definitions = createSessionToolDefinitions(services, defaultSessionToolsConfig)

  const value = await tool(definitions, 'fork_session').execute(
    { session_id: 'source', at_seq: 42 },
    execution(caller, 'fork_session'),
  )

  assert.deepEqual(calls, [
    { approval: 'Fork session source at or after seq 42' },
    { fork: { sessionId: 'source', atSeq: 42 } },
  ])
  assert.deepEqual(value, { sourceSessionId: 'source', sessionId: 'forked', atSeq: 42 })
})

test('send_message_to_session queues one attributed follow-up after resolving the target', async () => {
  const caller = agent('current')
  const delivered: UserMessage[] = []
  const target = {
    ...agent('target'),
    followup: (message: UserMessage) => delivered.push(message),
  } as Agent
  const services = baseServices(caller)
  const calls: string[] = []
  services.approval = {
    request: async (request) => {
      calls.push(request.reason ?? '')
      return 'allowed-once'
    },
  }
  services.resolveAgent = async (sessionId) => {
    calls.push(sessionId)
    return target
  }
  const definitions = createSessionToolDefinitions(services, defaultSessionToolsConfig)

  const value = await tool(definitions, 'send_message_to_session').execute(
    { session_id: 'target', message: 'Please continue with the review.' },
    execution(caller, 'send_message_to_session'),
  )

  assert.deepEqual(calls, [
    'Send a follow-up message to session target',
    'target',
  ])
  assert.equal(delivered.length, 1)
  assert.deepEqual(delivered[0]?.content, [{ type: 'text', text: 'Please continue with the review.' }])
  assert.deepEqual(delivered[0]?.source, {
    kind: 'session-relay',
    form: 'relay',
    senderSessionId: 'current',
  })
  assert.deepEqual(value, {
    targetSessionId: 'target',
    messageId: delivered[0]?.id,
    delivery: 'queued',
  })
})
