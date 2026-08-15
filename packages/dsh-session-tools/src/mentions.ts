import type { UserMessage } from '@deepseek-ai/dsh-llm'
import {
  parseSessionReferenceText,
  type SessionReferenceInput,
} from '@deepseek-ai/dsh-session-reference'

/** Collect first-appearance session mentions from direct user text only. */
export function sessionReferencesFromMessages(
  messages: readonly UserMessage[],
): SessionReferenceInput[] {
  const references: SessionReferenceInput[] = []
  const seen = new Set<string>()
  for (const message of messages) {
    if (message.source.kind !== 'user') continue
    for (const block of message.content) {
      if (block.type !== 'text') continue
      for (const reference of parseSessionReferenceText(block.text).references) {
        if (seen.has(reference.sessionId)) continue
        seen.add(reference.sessionId)
        references.push(reference)
      }
    }
  }
  return references
}

/** Session ids already present as `session-reference` context in this step. */
export function injectedSessionIds(messages: readonly UserMessage[]): Set<string> {
  const ids = new Set<string>()
  for (const message of messages) {
    if (message.source.kind !== 'session-reference') continue
    for (const reference of message.source.references) ids.add(reference.sessionId)
  }
  return ids
}
