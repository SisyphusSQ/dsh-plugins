import { memo, useMemo } from 'react'
import type { AssistantChatData, ChatNodeViewProps, TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { AssistantMarkdown } from './AssistantMarkdown.js'
import type { THINKING_COLLAPSE_NS } from './locales.js'
import { THINKING_TIMING_KEY } from './timing.js'
import { atomicKitFromChatNode } from './toolview.js'
import type { ToolViewSlots } from './toolview.js'

export interface AssistantNodeViewProps extends ChatNodeViewProps<'assistant-step'> {
  readonly thinkingT: TranslateNS<typeof THINKING_COLLAPSE_NS>
  /** Tool views own the `conversation` namespace; Chat nodes own `chat`. */
  readonly conversationT: TranslateNS<'conversation'>
  readonly slots: ToolViewSlots
}

/** Assistant renderer with a replaced activity row. */
export const AssistantNodeView = memo(function AssistantNodeView(props: AssistantNodeViewProps) {
  const {
    node,
    useTurnData,
    useChat,
    cwd,
    openFile,
    inspectCall,
    renderMessageImages,
    fileMentions,
    t,
    thinkingT,
    conversationT,
    slots,
  } = props
  const data = node.data
  const turn = node.location.kind === 'turn' || node.location.kind === 'step'
    ? node.location.turn
    : undefined
  const tail = useTurnData('turn-tail')
  const owner = useMemo<TurnTailOwnerProps | undefined>(() => {
    if (turn?.status !== 'closed' || data.finalNode === undefined) return undefined
    if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return undefined
    return { turn, seq: data.finalNode.seq, openFile }
  }, [data.finalNode, openFile, tail, turn])
  const mentions = useMemo(
    () => owner === undefined ? undefined : fileMentions(owner),
    [fileMentions, owner],
  )
  const thinkingTiming = node.location.kind === 'step'
    ? node.location.step.data.get(THINKING_TIMING_KEY)
    : undefined
  const assistant = useMemo<HostObservable<Readonly<AssistantChatData> | undefined> | undefined>(
    () => node.location.kind === 'step' ? node.location.step.data.source('assistant-step') : undefined,
    [node.location],
  )
  const kit = useMemo(
    () => atomicKitFromChatNode(props, conversationT),
    // The kit is only as stable as the standard members it forwards.
    [
      conversationT,
      props.t,
      props.sessionId,
      props.useSession,
      props.useProjection,
      props.useSessions,
      props.useDisclosure,
      props.loadImage,
    ],
  )

  return (
    <AssistantMarkdown
      blocks={data.blocks}
      streaming={data.status === 'running'}
      interrupted={data.status === 'interrupted'}
      renderMessageImages={renderMessageImages}
      mentions={mentions}
      thinkingTiming={thinkingTiming}
      turn={data.turn}
      step={data.step}
      location={node.location}
      slots={slots}
      kit={kit}
      useChat={useChat}
      cwd={cwd}
      openFile={openFile}
      inspectCall={inspectCall}
      assistant={assistant}
      t={t}
      thinkingT={thinkingT}
    />
  )
})
