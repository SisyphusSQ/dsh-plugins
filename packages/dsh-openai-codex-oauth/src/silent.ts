import type { AuthEvent, AuthInteraction, AuthPrompt } from '@earendil-works/pi-ai'

import type { OpenUrl } from './open-url.js'

export const LOGIN_CANCELLED_MESSAGE = 'login cancelled'
export const CALLBACK_COMPLETED_MESSAGE = 'browser callback completed'

export interface SilentBrowserInteractionOptions {
  readonly openUrl: OpenUrl
  readonly signal?: AbortSignal
}

export function hangUntilAborted(
  promptSignal: AbortSignal | undefined,
  userSignal: AbortSignal | undefined,
): Promise<string> {
  return new Promise((_resolve, reject) => {
    const settle = (error: Error) => {
      promptSignal?.removeEventListener('abort', onPromptAbort)
      userSignal?.removeEventListener('abort', onUserAbort)
      reject(error)
    }
    const onUserAbort = () => settle(new Error(LOGIN_CANCELLED_MESSAGE))
    const onPromptAbort = () => settle(new Error(CALLBACK_COMPLETED_MESSAGE))
    if (userSignal?.aborted === true) {
      onUserAbort()
      return
    }
    if (promptSignal?.aborted === true) {
      onPromptAbort()
      return
    }
    userSignal?.addEventListener('abort', onUserAbort, { once: true })
    promptSignal?.addEventListener('abort', onPromptAbort, { once: true })
  })
}

export function createSilentBrowserInteraction(
  options: SilentBrowserInteractionOptions,
): AuthInteraction {
  let pendingOpen: Promise<void> = Promise.resolve()
  return {
    ...options.signal === undefined ? {} : { signal: options.signal },
    notify(event: AuthEvent) {
      if (event.type !== 'auth_url') return
      pendingOpen = options.openUrl(event.url)
    },
    async prompt(prompt: AuthPrompt): Promise<string> {
      await pendingOpen
      if (prompt.type === 'select') {
        const browser = prompt.options.find((option) => option.id === 'browser')
        if (browser === undefined) throw new Error('OpenAI OAuth method is not recognized')
        return browser.id
      }
      if (prompt.type === 'manual_code') {
        return hangUntilAborted(prompt.signal, options.signal)
      }
      throw new Error('silent browser login does not accept this prompt')
    },
  }
}
