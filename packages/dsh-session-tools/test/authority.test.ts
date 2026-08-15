import assert from 'node:assert/strict'
import test from 'node:test'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { HarnessError, type CallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import {
  requireApproval,
  requireRootExecution,
  type AgentAuthorityRegistry,
  type ApprovalRequester,
} from '../lib/authority.js'

function agent(id: string): Agent {
  const value = {
    id: SessionId(id),
    status: 'running',
  }
  return value as unknown as Agent
}

function execution(caller: Agent): ToolRunContext {
  return {
    callId: 'call-1' as CallId,
    rootCallId: 'call-1' as CallId,
    name: 'list_sessions',
    arguments: {},
    agent: caller,
    signal: new AbortController().signal,
    token: Symbol('execution') as ToolRunContext['token'],
    deferContext: () => undefined,
    concludeTurn: () => undefined,
  }
}

test('requireRootExecution rejects a live subagent caller', () => {
  const root = agent('root')
  const child = agent('child')
  const registry: AgentAuthorityRegistry = {
    get: (id) => id === child.id ? child : root,
    currentInitiator: () => child,
    roots: () => [root],
  }

  assert.throws(
    () => requireRootExecution(registry, execution(child)),
    (error: unknown) => error instanceof HarnessError && error.code === 'SESSION_TOOLS_ROOT_REQUIRED',
  )
})

test('requireRootExecution rejects a stale root agent object', () => {
  const caller = agent('root')
  const replacement = agent('root')
  const registry: AgentAuthorityRegistry = {
    get: () => replacement,
    currentInitiator: () => caller,
    roots: () => [caller],
  }

  assert.throws(
    () => requireRootExecution(registry, execution(caller)),
    (error: unknown) => error instanceof HarnessError && error.code === 'SESSION_TOOLS_DRIVER_REQUIRED',
  )
})

test('requireApproval fails closed when the answer is not allowed-once', async () => {
  const caller = agent('root')
  const requests: unknown[] = []
  const approval: ApprovalRequester = {
    request: async (request) => {
      requests.push(request)
      return 'rejected'
    },
  }
  const exec = execution(caller)

  await assert.rejects(
    requireApproval(approval, caller, exec, 'read another session'),
    (error: unknown) => error instanceof HarnessError && error.code === 'SESSION_TOOLS_APPROVAL_REJECTED',
  )
  assert.deepEqual(requests, [{
    agent: caller,
    toolName: 'list_sessions',
    callId: 'call-1',
    reason: 'read another session',
    signal: exec.signal,
  }])
})
