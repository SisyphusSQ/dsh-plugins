import type { ConversationSnapshot, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatViewSlotProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
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
  readonly selectedCallId?: string | undefined
  readonly cwd?: string | undefined
  readonly openFile: (path: string) => void
  readonly inspectCall: (callId: string) => void
  readonly t: ChatViewSlotProps['t']
}

/** Native DSH Think rows and official tool trees in turn activity order. */
export function TurnActivityBody({
  items,
  toolRoots,
  streamingSteps,
  slots,
  kit,
  selectedCallId,
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
              selectedCallId={selectedCallId}
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
  snapshot: ConversationSnapshot,
  turn: number,
  steps: readonly number[],
): Record<number, ToolCallBlock[]> {
  const next: Record<number, ToolCallBlock[]> = {}
  for (const step of steps) next[step] = absorbableToolRoots(snapshot, turn, step)
  return next
}
