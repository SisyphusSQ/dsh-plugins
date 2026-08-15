import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { AssistantNodeView } from './AssistantNodeView.js'
import { en, THINKING_COLLAPSE_NS, zh } from './locales.js'
import { thinkingTimingDefinition } from './timing.js'

export const inject = ['slots', 'conversationEvents', 'locale']

/** Install the timing projection and shadow the rc.6 assistant-step renderer. */
export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(thinkingTimingDefinition)
  ctx.effect(
    () => ctx.locale.register(THINKING_COLLAPSE_NS, { zh, en }),
    'dsh-thinking-collapse: dictionaries',
  )
  const thinkingT = ctx.locale.bind(THINKING_COLLAPSE_NS)
  const CodexAssistantNodeView = (props: ChatNodeViewProps<'assistant-step'>) => (
    <AssistantNodeView {...props} thinkingT={thinkingT} />
  )
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'assistant-step',
    priority: -1,
    locale: 'conversation',
  }, CodexAssistantNodeView))
}
