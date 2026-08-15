import { memo, useMemo } from 'react'
import type {
  ChatNodeViewProps,
  TurnTailOwnerProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { AssistantMarkdown } from './AssistantMarkdown.js'
import type { THINKING_COLLAPSE_NS } from './locales.js'
import { THINKING_TIMING_KEY } from './timing.js'

export interface AssistantNodeViewProps extends ChatNodeViewProps<'assistant-step'> {
  readonly thinkingT: TranslateNS<typeof THINKING_COLLAPSE_NS>
}

/** rc.6-compatible Assistant renderer with a replaced reasoning row. */
export const AssistantNodeView = memo(function AssistantNodeView({
  node,
  useTurnData,
  openFile,
  loadImage,
  fileMentions,
  t,
  thinkingT,
}: AssistantNodeViewProps) {
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
      t={t}
      thinkingT={thinkingT}
    />
  )
})
