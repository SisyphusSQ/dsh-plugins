import type { AssistantChatData, ChatNodeViewProps, ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import {
  absorbableToolRoots,
  liveReasoningItem,
  type TurnActivityItem,
} from './activity.js'
import { ThinkRow } from './ThinkRow.js'
import type { AtomicToolViewKit, ToolViewSlots } from './toolview.js'
import { ToolCallTree } from './ToolCallTree.js'
import rowCss from './ReasoningRow.module.css'

export interface TurnActivityBodyProps {
  readonly items: readonly TurnActivityItem[]
  readonly toolRoots: Readonly<Record<string, ToolCallBlock>>
  readonly streamingSteps: ReadonlySet<number>
  readonly slots: ToolViewSlots
  readonly kit: AtomicToolViewKit
  /** Step assistant source, forwarded to preparing Tool rows. */
  readonly assistant?: HostObservable<Readonly<AssistantChatData> | undefined> | undefined
  readonly cwd?: string | undefined
  readonly openFile: ChatNodeViewProps['openFile']
  readonly inspectCall: ChatNodeViewProps['inspectCall']
  readonly t: TranslateNS<'chat'>
}

/** Native DSH Think rows and official tool trees in turn activity order. */
export function TurnActivityBody({
  items,
  toolRoots,
  streamingSteps,
  slots,
  kit,
  assistant,
  cwd,
  openFile,
  inspectCall,
  t,
}: TurnActivityBodyProps) {
  const liveThought = liveReasoningItem(items, streamingSteps)
  return (
    <>
      {items.map(item => {
        if (item.kind === 'reasoning') {
          const live = liveThought?.step === item.step && liveThought.index === item.index
          return (
            <ThinkRow
              key={`thought-${item.step}-${item.index}`}
              text={item.text}
              running={live}
              t={t}
            />
          )
        }
        const root = toolRoots[item.callId]
        if (root === undefined) return null
        return (
          <div key={item.callId} className={rowCss.toolsBody}>
            <ToolCallTree
              slots={slots}
              kit={kit}
              block={root}
              assistant={assistant}
              cwd={cwd}
              openFile={openFile}
              inspectCall={inspectCall}
            />
          </div>
        )
      })}
    </>
  )
}

export function toolRootMap(
  roots: readonly ToolCallBlock[],
): Record<string, ToolCallBlock> {
  const next: Record<string, ToolCallBlock> = {}
  for (const root of roots) next[root.callId] = root
  return next
}

export function absorbableToolRootsByStep(
  snapshot: ChatSnapshot,
  turn: number,
  steps: readonly number[],
): Record<number, ToolCallBlock[]> {
  const next: Record<number, ToolCallBlock[]> = {}
  for (const step of steps) next[step] = absorbableToolRoots(snapshot, turn, step)
  return next
}
