import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {
  ClientContext,
  ISessions,
} from '@deepseek-ai/dsh-client-runtime/client'

import { createSessionMentionSource } from './source.js'

interface InputTriggerRegistry {
  registerSource(source: unknown): () => void
}

export const inject = ['sessions', 'inputTriggers']

export function apply(ctx: ClientContext): void {
  const sessions = ctx.get('sessions') as unknown as ISessions
  const inputTriggers = ctx.get('inputTriggers') as unknown as InputTriggerRegistry

  ctx.effect(() => {
    const unregister = inputTriggers.registerSource(
      createSessionMentionSource({
        snapshot: () => sessions.list.getSnapshot(),
        subscribe: (listener) => sessions.list.subscribe(listener),
      }),
    )
    return () => {
      unregister()
    }
  }, 'dsh-session-tools: @session source')
}
