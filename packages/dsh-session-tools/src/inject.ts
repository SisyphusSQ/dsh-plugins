import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { ContentBlock, UserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionReferenceResolver } from '@deepseek-ai/dsh-session-reference'

import { injectedSessionIds, sessionReferencesFromMessages } from './mentions.js'

export interface InjectMentionedSessionReferencesOptions {
  readonly agent: Agent
  readonly claimedMessages: readonly UserMessage[]
  readonly decision: PreStepDecision
  readonly prepare: SessionReferenceResolver['prepare']
  readonly signal: AbortSignal
}

function claimedContent(messages: readonly UserMessage[]): ContentBlock[] {
  return messages.flatMap((message) => (
    message.source.kind === 'user' ? [...message.content] : []
  ))
}

/**
 * Add untrusted session snapshots for composer mentions after downstream
 * pre-step listeners run. Does not rewrite the already-durable user message.
 */
export async function injectMentionedSessionReferences({
  agent,
  claimedMessages,
  decision,
  prepare,
  signal,
}: InjectMentionedSessionReferencesOptions): Promise<PreStepDecision> {
  if (decision.kind === 'reject') return decision
  signal.throwIfAborted()

  const mentioned = sessionReferencesFromMessages(claimedMessages)
  if (mentioned.length === 0) return decision

  const already = injectedSessionIds(decision.messages)
  const references = mentioned.filter((reference) => !already.has(reference.sessionId))
  if (references.length === 0) return decision

  const prepared = await prepare(
    agent,
    claimedContent(claimedMessages),
    references,
    signal,
  )
  const context = prepared.additionalContext
  if (context === undefined || context.source.kind !== 'session-reference') {
    return decision
  }

  return {
    kind: 'enter',
    messages: [context, ...decision.messages],
  }
}
