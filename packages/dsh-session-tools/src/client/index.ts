import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// 0.2: `dsh-client-runtime` no longer exists. Each owning package merges its
// Client service onto Cordis `Context` through its own `/client` type entry —
// here the Client Session object layer that owns `ctx.sessions`.
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'

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
