import { memo, useMemo } from 'react'
import type {
  ChatNodeViewProps,
  TurnTailOwnerProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { AssistantMarkdown } from './AssistantMarkdown.js'
import type { THINKING_COLLAPSE_NS } from './locales.js'
import { THINKING_TIMING_KEY } from './timing.js'
import { atomicKitFromChatNode } from './toolview.js'
import type { ToolViewSlots } from './toolview.js'

export interface AssistantNodeViewProps extends ChatNodeViewProps<'assistant-step'> {
  readonly thinkingT: TranslateNS<typeof THINKING_COLLAPSE_NS>
  readonly slots: ToolViewSlots
}

/** rc.6-compatible Assistant renderer with a replaced activity row. */
export const AssistantNodeView = memo(function AssistantNodeView(props: AssistantNodeViewProps) {
  const {
    node,
    useTurnData,
    useSession,
    selectedCallId,
    cwd,
    openFile,
    inspectCall,
    loadImage,
    fileMentions,
    t,
    thinkingT,
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

  return (
    <AssistantMarkdown
      blocks={data.blocks}
      streaming={data.status === 'running'}
      interrupted={data.status === 'interrupted'}
      loadImage={loadImage}
      mentions={mentions}
      thinkingTiming={thinkingTiming}
      turn={data.turn}
      step={data.step}
      location={node.location}
      slots={slots}
      kit={atomicKitFromChatNode(props)}
      useSession={useSession}
      selectedCallId={selectedCallId}
      cwd={cwd}
      openFile={openFile}
      inspectCall={inspectCall}
      t={t}
      thinkingT={thinkingT}
    />
  )
})
