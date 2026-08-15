import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

const assistantNodeView = vi.hoisted(() => ({ name: 'AssistantNodeView' }))
const toolCallNodeView = vi.hoisted(() => ({ name: 'ToolCallNodeView' }))
const timingDefinition = vi.hoisted(() => ({ kind: 'thinking-collapse-timing' }))

vi.mock('../src/client/AssistantNodeView.js', () => ({
  AssistantNodeView: assistantNodeView,
}))

vi.mock('../src/client/ToolCallNodeView.js', () => ({
  ToolCallNodeView: toolCallNodeView,
}))

vi.mock('../src/client/timing.js', () => ({
  thinkingTimingDefinition: timingDefinition,
}))

import { apply } from '../src/client/index.js'
import { en, THINKING_COLLAPSE_NS, zh } from '../src/client/locales.js'

describe('client plugin contribution', () => {
  it('registers timing and shadows assistant-step and tool-call without redeclaring toolview', () => {
    const registerEvent = vi.fn()
    const registerSlot = vi.fn()
    const injectSlot = vi.fn((_name: string, install: () => void) => install())
    const registerLocale = vi.fn(() => vi.fn())
    const thinkingT = vi.fn()
    const bindLocale = vi.fn(() => thinkingT)
    const effect = vi.fn((install: () => unknown) => install())
    const ctx = {
      conversationEvents: { register: registerEvent },
      slots: { inject: injectSlot, register: registerSlot },
      locale: { register: registerLocale, bind: bindLocale },
      effect,
    } as unknown as ClientContext

    apply(ctx)

    expect(registerEvent).toHaveBeenCalledOnce()
    expect(registerEvent).toHaveBeenCalledWith(timingDefinition)
    expect(registerLocale).toHaveBeenCalledWith(THINKING_COLLAPSE_NS, { zh, en })
    expect(bindLocale).toHaveBeenCalledWith(THINKING_COLLAPSE_NS)
    expect(injectSlot).toHaveBeenCalledWith('conversation.chat.node', expect.any(Function))
    expect(registerSlot).toHaveBeenCalledTimes(2)
    expect(registerSlot).toHaveBeenNthCalledWith(1, {
      name: 'conversation.chat.node',
      key: 'assistant-step',
      priority: -1,
      locale: 'conversation',
    }, expect.any(Function))
    expect(registerSlot).toHaveBeenNthCalledWith(2, {
      name: 'conversation.chat.node',
      key: 'tool-call',
      priority: -1,
      locale: 'conversation',
    }, expect.any(Function))
    expect(registerSlot.mock.calls[0]?.[0]).not.toHaveProperty('children')
    expect(registerSlot.mock.calls[1]?.[0]).not.toHaveProperty('children')
  })
})
