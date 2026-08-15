/** Model-facing cross-session capabilities for DeepSeek Harness. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-host-apiproxy'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-reference'
import { TypertLookupFailure } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import { injectMentionedSessionReferences } from './inject.js'
import {
  createSessionToolDefinitions,
  defaultSessionToolsConfig,
  type SessionToolsConfig,
} from './tools.js'

export const name = 'session-tools'

export const inject = [
  'tools',
  'agents',
  'approval',
  'apiProxy',
  'sessionQuery',
  'sessionReferenceResolver',
  'typert',
]

export const Config = z.object({
  approveRead: z.boolean().default(true),
  approveCreate: z.boolean().default(true),
  approveRenameCurrent: z.boolean().default(false),
  approveRenameOther: z.boolean().default(true),
  approveFork: z.boolean().default(true),
  approveSend: z.boolean().default(true),
})

function lookupFailure(error: TypertLookupFailure): HarnessError {
  const failure = error.failure
  const record = typeof failure === 'object' && failure !== null
    ? failure as { code?: unknown; message?: unknown }
    : {}
  const code = typeof record.code === 'string' ? record.code : 'rejected'
  const message = typeof record.message === 'string'
    ? record.message
    : 'the Host rejected the target session lookup'
  return new HarnessError(
    message,
    `SESSION_TOOLS_LOOKUP_${code.toUpperCase().replaceAll('-', '_')}`,
  )
}

async function lookupAgent(ctx: Context, sessionId: SessionId): Promise<Agent | undefined> {
  const provider = ctx.typert.lookups.get('agent')
  if (provider === undefined) {
    throw new HarnessError(
      'the Host has no Typert agent lookup provider; mount @deepseek-ai/dsh-api-remotes',
      'SESSION_TOOLS_AGENT_LOOKUP_UNAVAILABLE',
    )
  }
  try {
    return await Promise.resolve(
      provider.resolve(sessionId) as Agent | undefined | Promise<Agent | undefined>,
    )
  } catch (error) {
    if (error instanceof TypertLookupFailure) throw lookupFailure(error)
    throw error
  }
}

export function apply(ctx: Context, config: Partial<SessionToolsConfig> = {}): void {
  const resolvedConfig: SessionToolsConfig = { ...defaultSessionToolsConfig, ...config }
  const definitions = createSessionToolDefinitions({
    agents: ctx.agents,
    approval: ctx.approval,
    sessionQuery: ctx.sessionQuery,
    sessionReferenceResolver: ctx.sessionReferenceResolver,
    sessionsApi: ctx.apiProxy.sessions,
    resolveAgent: (sessionId) => lookupAgent(ctx, sessionId),
  }, resolvedConfig)

  for (const definition of definitions) ctx.tools.register(definition)

  ctx.on(
    'agent/pre-step',
    async ({ agent, messages, signal }, next) => {
      const decision: PreStepDecision = await next()
      if (decision.kind === 'reject') return decision
      signal.throwIfAborted()
      return injectMentionedSessionReferences({
        agent,
        claimedMessages: messages,
        decision,
        prepare: (target, content, references, prepareSignal) => (
          ctx.sessionReferenceResolver.prepare(
            target,
            content,
            references,
            prepareSignal,
          )
        ),
        signal,
      })
    },
    { prepend: true },
  )
}

export { listSessionMentionCandidates } from './client/candidates.js'
export { createSessionMentionSource } from './client/source.js'
export { injectMentionedSessionReferences } from './inject.js'
export {
  injectedSessionIds,
  sessionReferencesFromMessages,
} from './mentions.js'
export { createSessionToolDefinitions, defaultSessionToolsConfig } from './tools.js'
export {
  encodeSessionReferenceUri,
  formatSessionReferenceMention,
  SESSION_REFERENCE_SCHEME,
} from './uri.js'
export type { SessionToolServices, SessionToolsConfig } from './tools.js'
export type { SessionRelayMessageSource } from './message-source.js'
