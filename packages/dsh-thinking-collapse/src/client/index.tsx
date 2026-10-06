import type { Context } from '@deepseek-ai/cordis'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { AssistantNodeView } from './AssistantNodeView.js'
import { ToolCallNodeView } from './ToolCallNodeView.js'
import { en, THINKING_COLLAPSE_NS, zh } from './locales.js'
import { thinkingTimingDefinition } from './timing.js'

export const inject = ['slots', 'uiConversation', 'locale']

/** Install the timing projection and shadow the built-in assistant-step and tool-call renderers. */
export function apply(ctx: Context): void {
  ctx.uiConversation.events.register(thinkingTimingDefinition)
  ctx.effect(
    () => ctx.locale.register(THINKING_COLLAPSE_NS, { zh, en }),
    'dsh-thinking-collapse: dictionaries',
  )
  const thinkingT = ctx.locale.bind(THINKING_COLLAPSE_NS)
  // A Chat Node entry is rendered in the `chat` namespace, while the official
  // atomic Tool views it dispatches own the `conversation` namespace.
  const conversationT = ctx.locale.bind('conversation')
  const CodexAssistantNodeView = (props: ChatNodeViewProps<'assistant-step'>) => (
    <AssistantNodeView
      {...props}
      thinkingT={thinkingT}
      conversationT={conversationT}
      slots={ctx.slots}
    />
  )
  const CodexToolCallNodeView = (props: ChatNodeViewProps<'tool-call'>) => (
    <ToolCallNodeView
      {...props}
      thinkingT={thinkingT}
      conversationT={conversationT}
      slots={ctx.slots}
    />
  )
  ctx.slots.inject('conversation.chat.node', () => [
    ctx.slots.register({
      name: 'conversation.chat.node',
      key: 'assistant-step',
      priority: -1,
      locale: 'chat',
    }, CodexAssistantNodeView),
    ctx.slots.register({
      name: 'conversation.chat.node',
      key: 'tool-call',
      priority: -1,
      locale: 'chat',
    }, CodexToolCallNodeView),
  ])
}
