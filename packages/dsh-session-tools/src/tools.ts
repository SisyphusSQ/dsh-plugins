import type { Agent } from '@deepseek-ai/dsh-agent'
import { RpcId, type RpcResponse, type SessionsApi } from '@deepseek-ai/dsh-host-apiproxy/api'
import { createUserMessage, HarnessError } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import type { SessionReferenceResolver } from '@deepseek-ai/dsh-session-reference'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import {
  requireApproval,
  requireRootExecution,
  type AgentAuthorityRegistry,
  type ApprovalRequester,
} from './authority.js'
import { buildSessionList } from './session-list.js'
import type {} from './message-source.js'

export interface SessionToolsConfig {
  approveRead: boolean
  approveCreate: boolean
  approveRenameCurrent: boolean
  approveRenameOther: boolean
  approveFork: boolean
  approveSend: boolean
}

export const defaultSessionToolsConfig: Readonly<SessionToolsConfig> = Object.freeze({
  approveRead: true,
  approveCreate: true,
  approveRenameCurrent: false,
  approveRenameOther: true,
  approveFork: true,
  approveSend: true,
})

export interface SessionToolServices {
  agents: AgentAuthorityRegistry
  approval: ApprovalRequester
  sessionQuery: Pick<SessionQueryEngine, 'listSessions' | 'readTitleSnapshots'>
  sessionReferenceResolver: Pick<SessionReferenceResolver, 'prepare'>
  sessionsApi: Pick<SessionsApi, 'create' | 'rename' | 'fork'>
  resolveAgent(sessionId: SessionId): Promise<Agent | undefined>
}

function rpcId(exec: { agent?: Agent; callId: string }, operation: string): ReturnType<typeof RpcId> {
  return RpcId(`${exec.agent?.id ?? 'agentless'}:${exec.callId}:${operation}`)
}

function unwrapApiResponse<T>(response: RpcResponse<T>, operation: string): T {
  if (response.result.ok) return response.result.value
  const { error } = response.result
  throw new HarnessError(
    `${operation} failed: ${error.message}`,
    `SESSION_TOOLS_API_${error.code.toUpperCase().replaceAll('-', '_')}`,
  )
}

export function createSessionToolDefinitions(
  services: SessionToolServices,
  config: SessionToolsConfig,
): ToolDefinition[] {
  return [defineTool({
    name: 'list_sessions',
    description: 'List ordinary DSH sessions visible to this Host. Matches only session id, title, and working directory; it never searches message bodies. Subagent-owned sessions are excluded.',
    parameters: {
      query: {
        type: 'string',
        description: 'Optional case-insensitive substring matched against session id, title, or cwd.',
      },
      limit: {
        type: 'integer',
        description: 'Maximum results from 1 to 100. Defaults to 50.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sessions: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                sessionId: { type: 'string', required: true },
                title: { type: 'string', required: true },
                cwd: { type: 'string' },
                createdAt: { type: 'integer', required: true },
                parentSessionId: { type: 'string' },
                agentPreset: { type: 'string' },
                live: { type: 'boolean', required: true },
                persisted: { type: 'boolean', required: true },
                current: { type: 'boolean', required: true },
              },
            },
          },
          count: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `found ${(value as { count: number }).count} ordinary session(s)`,
      }],
    },
    async execute(args, exec) {
      const caller = requireRootExecution(services.agents, exec)
      const limit = args.limit ?? 50
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new HarnessError('list_sessions limit must be an integer from 1 to 100', 'SESSION_TOOLS_INVALID_LIMIT')
      }
      const records = await services.sessionQuery.listSessions(exec.signal)
      const ordinaryRecords = records.filter((record) => record.header.origin !== 'subagent')
      const titles = await services.sessionQuery.readTitleSnapshots(
        ordinaryRecords.map((record) => record.header.id),
        exec.signal,
      )
      const sessions = buildSessionList(ordinaryRecords, titles, {
        currentSessionId: caller.id,
        query: args.query ?? '',
        limit,
      })
      return { sessions, count: sessions.length }
    },
  }), defineTool({
    name: 'read_session',
    description: 'Read one other ordinary DSH session as a bounded, untrusted snapshot. The snapshot is attached as sourced context after this tool result; tool calls, reasoning, internal context, and unfinished chunks are excluded.',
    parameters: {
      session_id: {
        type: 'string',
        required: true,
        description: 'Exact source session id returned by list_sessions.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sessionId: { type: 'string', required: true },
          label: { type: 'string', required: true },
          capturedThroughSeq: {
            oneOf: [{ type: 'integer' }, { type: 'null' }],
            required: true,
          },
          compacted: { type: 'boolean', required: true },
          originalMessages: { type: 'integer', required: true },
          retainedMessages: { type: 'integer', required: true },
          omittedMessages: { type: 'integer', required: true },
          omittedBytes: { type: 'integer', required: true },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `attached an untrusted snapshot of session ${(value as { sessionId: string }).sessionId}`,
      }],
    },
    async execute(args, exec) {
      const caller = requireRootExecution(services.agents, exec)
      const sourceId = SessionId(args.session_id)
      if (sourceId === caller.id) {
        throw new HarnessError('read_session cannot reference the calling session', 'SESSION_TOOLS_SELF_REFERENCE')
      }
      if (config.approveRead) {
        await requireApproval(services.approval, caller, exec, `Read an untrusted snapshot of session ${sourceId}`)
      }
      const prepared = await services.sessionReferenceResolver.prepare(
        caller,
        [],
        [{ sessionId: sourceId }],
        exec.signal,
      )
      const context = prepared.additionalContext
      if (context === undefined || context.source.kind !== 'session-reference') {
        throw new HarnessError(
          'session-reference resolver returned no sourced snapshot',
          'SESSION_TOOLS_REFERENCE_UNAVAILABLE',
        )
      }
      const reference = context.source.references[0]
      if (reference === undefined || reference.sessionId !== sourceId) {
        throw new HarnessError(
          'session-reference resolver returned mismatched snapshot metadata',
          'SESSION_TOOLS_REFERENCE_MISMATCH',
        )
      }
      exec.deferContext(context)
      return {
        sessionId: reference.sessionId,
        label: reference.label,
        capturedThroughSeq: reference.capturedThroughSeq,
        compacted: reference.compacted,
        originalMessages: reference.originalMessages,
        retainedMessages: reference.retainedMessages,
        omittedMessages: reference.omittedMessages,
        omittedBytes: reference.omittedBytes,
        truncated: reference.truncated,
      }
    },
  }), defineTool({
    name: 'create_session',
    description: 'Create a real persisted DSH session and its idle Agent through the Host business API. By default it inherits this session\'s cwd and agent preset. The new session is not prompted automatically.',
    parameters: {
      cwd: {
        type: 'string',
        description: 'Optional absolute working directory. Defaults to the calling session cwd, then the Host cwd.',
      },
      agent_preset: {
        type: 'string',
        description: 'Optional Agent preset id. Defaults to the calling session preset, then the deployment default.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sessionId: { type: 'string', required: true },
          cwd: { type: 'string' },
          agentPreset: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `created session ${(value as { sessionId: string }).sessionId}`,
      }],
    },
    async execute(args, exec) {
      const caller = requireRootExecution(services.agents, exec)
      const cwd = args.cwd ?? caller.session.header.cwd
      const agentPreset = args.agent_preset ?? caller.session.header.agentPreset
      if (config.approveCreate) {
        await requireApproval(
          services.approval,
          caller,
          exec,
          `Create a new session in ${cwd ?? 'the Host cwd'} with agent preset ${agentPreset ?? 'the deployment default'}`,
        )
      }
      const response = await services.sessionsApi.create({
        rpcId: rpcId(exec, 'create'),
        payload: {
          ...(cwd === undefined ? {} : { cwd }),
          ...(agentPreset === undefined ? {} : { agentPreset }),
        },
      })
      const created = unwrapApiResponse(response, 'create_session')
      const effectiveAgentPreset = created.agentPreset ?? agentPreset
      return {
        sessionId: created.sessionId,
        ...(cwd === undefined ? {} : { cwd }),
        ...(effectiveAgentPreset === undefined ? {} : { agentPreset: effectiveAgentPreset }),
      }
    },
  }), defineTool({
    name: 'rename_session',
    description: 'Rename the current or another ordinary DSH session through the Host business API. The accepted title is normalized and pinned against automatic regeneration; another-session rename requires approval by default.',
    parameters: {
      session_id: {
        type: 'string',
        required: true,
        description: 'Exact session id. Use the calling session id to rename the current session.',
      },
      title: {
        type: 'string',
        required: true,
        description: 'New title. Host normalization and byte limits apply.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sessionId: { type: 'string', required: true },
          title: { type: 'string', required: true },
          seq: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `renamed session ${(value as { sessionId: string }).sessionId}`,
      }],
    },
    async execute(args, exec) {
      const caller = requireRootExecution(services.agents, exec)
      const targetId = SessionId(args.session_id)
      const current = targetId === caller.id
      if ((current && config.approveRenameCurrent) || (!current && config.approveRenameOther)) {
        await requireApproval(
          services.approval,
          caller,
          exec,
          current
            ? `Rename the current session to ${JSON.stringify(args.title)}`
            : `Rename session ${targetId} to ${JSON.stringify(args.title)}`,
        )
      }
      const response = await services.sessionsApi.rename({
        rpcId: rpcId(exec, 'rename'),
        payload: { sessionId: targetId, title: args.title },
      })
      const renamed = unwrapApiResponse(response, 'rename_session')
      return { sessionId: targetId, title: renamed.title, seq: renamed.seq }
    },
  }), defineTool({
    name: 'fork_session',
    description: 'Fork an ordinary DSH session through the Host business API. The Host cuts only at a completed turn, inherits cwd, model target, workspace, lineage, and title seed, and creates a real idle Agent.',
    parameters: {
      session_id: {
        type: 'string',
        required: true,
        description: 'Exact source session id.',
      },
      at_seq: {
        type: 'integer',
        description: 'Optional event seq anchor. The Host selects the first turn/end at or after it; omission uses the last completed turn.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sourceSessionId: { type: 'string', required: true },
          sessionId: { type: 'string', required: true },
          atSeq: { type: 'integer' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `forked session ${(value as { sourceSessionId: string }).sourceSessionId} as ${(value as { sessionId: string }).sessionId}`,
      }],
    },
    async execute(args, exec) {
      const caller = requireRootExecution(services.agents, exec)
      const sourceId = SessionId(args.session_id)
      if (args.at_seq !== undefined && (!Number.isInteger(args.at_seq) || args.at_seq < 0)) {
        throw new HarnessError('fork_session at_seq must be a non-negative integer', 'SESSION_TOOLS_INVALID_SEQ')
      }
      if (config.approveFork) {
        await requireApproval(
          services.approval,
          caller,
          exec,
          args.at_seq === undefined
            ? `Fork session ${sourceId} at its last completed turn`
            : `Fork session ${sourceId} at or after seq ${args.at_seq}`,
        )
      }
      const response = await services.sessionsApi.fork({
        rpcId: rpcId(exec, 'fork'),
        payload: {
          sessionId: sourceId,
          ...(args.at_seq === undefined ? {} : { atSeq: args.at_seq }),
        },
      })
      const forked = unwrapApiResponse(response, 'fork_session')
      return {
        sourceSessionId: sourceId,
        sessionId: forked.sessionId,
        ...(args.at_seq === undefined ? {} : { atSeq: args.at_seq }),
      }
    },
  }), defineTool({
    name: 'send_message_to_session',
    description: 'Queue one ordinary follow-up turn on another top-level DSH session. It waits for the target current turn to finish, returns only delivery confirmation, and is attributed as an Agent relay rather than direct user authority. Use send_message for subagents.',
    parameters: {
      session_id: {
        type: 'string',
        required: true,
        description: 'Exact target ordinary-session id. The calling session and subagent-owned sessions are rejected.',
      },
      message: {
        type: 'string',
        required: true,
        description: 'Non-empty text to queue as the target session\'s next ordinary turn.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          targetSessionId: { type: 'string', required: true },
          messageId: { type: 'string', required: true },
          delivery: { type: 'string', enum: ['queued'], required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `queued a follow-up for session ${(value as { targetSessionId: string }).targetSessionId}`,
      }],
    },
    async execute(args, exec) {
      const caller = requireRootExecution(services.agents, exec)
      const targetId = SessionId(args.session_id)
      if (targetId === caller.id) {
        throw new HarnessError(
          'send_message_to_session cannot target the calling session',
          'SESSION_TOOLS_SELF_RELAY',
        )
      }
      if (args.message.trim() === '') {
        throw new HarnessError(
          'send_message_to_session message must not be empty',
          'SESSION_TOOLS_EMPTY_MESSAGE',
        )
      }
      if (config.approveSend) {
        await requireApproval(
          services.approval,
          caller,
          exec,
          `Send a follow-up message to session ${targetId}`,
        )
      }
      const target = await services.resolveAgent(targetId)
      if (target === undefined) {
        throw new HarnessError(
          `target session ${targetId} could not be resolved to an Agent`,
          'SESSION_TOOLS_TARGET_UNAVAILABLE',
        )
      }
      if (target.id !== targetId) {
        throw new HarnessError(
          `Agent lookup returned ${target.id} for target session ${targetId}`,
          'SESSION_TOOLS_TARGET_MISMATCH',
        )
      }
      const message = createUserMessage({
        content: [{ type: 'text', text: args.message }],
        source: {
          kind: 'session-relay',
          form: 'relay',
          senderSessionId: caller.id,
        },
      })
      target.followup(message)
      return {
        targetSessionId: targetId,
        messageId: message.id,
        delivery: 'queued' as const,
      }
    },
  })]
}
