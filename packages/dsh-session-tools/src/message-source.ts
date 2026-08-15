import type { SessionId } from '@deepseek-ai/dsh-session'

/** Durable attribution for a follow-up sent from one ordinary session to another. */
export interface SessionRelayMessageSource {
  readonly kind: 'session-relay'
  readonly form: 'relay'
  readonly senderSessionId: SessionId
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'session-relay': SessionRelayMessageSource
  }
}
