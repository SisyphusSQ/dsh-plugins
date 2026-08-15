import { memo, useMemo } from 'react'
import type { ReactNode } from 'react'
import type {
  AssistantBlock,
  ConversationSnapshot,
  ToolCallBlock,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ImageLoader } from '@deepseek-ai/dsh-client-ui-attachment'
import { ImageGallery } from '@deepseek-ai/dsh-client-ui-attachment'
import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives'
import { JsonBlock, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type { AtomicToolViewKit, ToolViewSlots } from './toolview.js'
import { messageImageLabels } from './image-labels.js'
import type { THINKING_COLLAPSE_NS } from './locales.js'
import {
  absorbableToolRoots,
  hasVisibleAssistantContent,
  insertMissingActivityTools,
  isActivityBlock,
  isActivityLive,
  isAnswerBlock,
  isRunningToolBlock,
  lastActivityIndex,
  missingAbsorbableToolBlocks,
  toolCallName,
} from './activity.js'
import { ReasoningRow } from './ReasoningRow.js'
import { ToolCallTree } from './ToolCallTree.js'
import type { ThinkingTimingData } from './timing.js'
import css from './AssistantMarkdown.module.css'
import rowCss from './ReasoningRow.module.css'

export interface AssistantMarkdownProps {
  readonly blocks: readonly AssistantBlock[]
  readonly streaming: boolean
  readonly interrupted?: boolean | undefined
  readonly loadImage?: ImageLoader
  readonly mentions?: MarkdownFileMentions | undefined
  readonly thinkingTiming?: ThinkingTimingData | undefined
  readonly turn: number
  readonly step: number
  readonly slots: ToolViewSlots
  readonly kit: AtomicToolViewKit
  readonly useSession: SnapshotSelectorHook<ConversationSnapshot>
  readonly selectedCallId?: string | undefined
  readonly cwd?: string | undefined
  readonly openFile: (path: string) => void
  readonly inspectCall: (callId: string) => void
  readonly t: ChatViewSlotProps['t']
  readonly thinkingT: TranslateNS<typeof THINKING_COLLAPSE_NS>
}

/** Preserve rc.6 Assistant block behavior while replacing the activity row. */
export const AssistantMarkdown = memo(function AssistantMarkdown({
  blocks,
  streaming,
  interrupted,
  loadImage,
  mentions,
  thinkingTiming,
  turn,
  step,
  slots,
  kit,
  useSession,
  selectedCallId,
  cwd,
  openFile,
  inspectCall,
  t,
  thinkingT,
}: AssistantMarkdownProps) {
  const imageLoader = loadImage ?? (() => Promise.reject(new Error(t('image.serviceUnavailable'))))
  const codeLabels = useMemo(() => ({
    copyLabel: t('copy'),
    copiedLabel: t('copied'),
  }), [t])
  const toolRootList = useSession(snapshot => absorbableToolRoots(snapshot, turn, step))
  const toolRoots = useMemo(() => {
    const next: Record<string, ToolCallBlock> = {}
    for (const root of toolRootList) next[root.callId] = root
    return next
  }, [toolRootList])
  const displayBlocks = useMemo(() => insertMissingActivityTools(
    blocks,
    missingAbsorbableToolBlocks(
      blocks,
      toolRootList.map(root => ({
        callId: root.callId,
        name: toolCallName(root),
        argsRaw: 'kind' in root ? root.call?.argsRaw ?? '' : root.argsRaw,
      })),
    ),
  ), [blocks, toolRootList])
  const last = displayBlocks.length - 1
  if (!hasVisibleAssistantContent(displayBlocks)) return null

  const hasAnswer = displayBlocks.some(isAnswerBlock)
  const tailActivity = lastActivityIndex(displayBlocks)
  const rendered: ReactNode[] = []
  let group: AssistantBlock[] = []
  let groupStart = 0

  const flushGroup = (): void => {
    if (group.length === 0) return
    const start = groupStart
    const items = group
    group = []
    const groupEnd = start + items.length - 1
    const callIds = items.flatMap(block => block.kind === 'tool-call' ? [block.callId] : [])
    const toolsRunning = callIds.some(callId => {
      const root = toolRoots[callId]
      return root !== undefined && isRunningToolBlock(root)
    })
    const live = isActivityLive({
      hasAnswer,
      streaming,
      groupIncludesLastActivity: tailActivity !== -1 && start <= tailActivity && tailActivity <= groupEnd,
      toolsRunning,
    })
    const hasReasoning = items.some(block => block.kind === 'reasoning')
    rendered.push(
      <ReasoningRow
        key={`activity-${start}`}
        live={live}
        active={live}
        timing={thinkingTiming?.activity}
        historyKind={hasReasoning ? 'reasoning' : 'tools'}
        t={t}
        thinkingT={thinkingT}
        codeLabels={codeLabels}
      >
        {items.map((block, offset) => {
          const index = start + offset
          if (block.kind === 'reasoning') {
            return (
              <div key={index} className={rowCss.thinkBody}>
                <MarkdownText
                  text={block.text}
                  streaming={live && streaming && index === last}
                  codeLabels={codeLabels}
                />
              </div>
            )
          }
          if (block.kind !== 'tool-call') return null
          const root = toolRoots[block.callId]
          if (root === undefined) return null
          return (
            <div key={block.callId} className={rowCss.toolsBody}>
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
      </ReasoningRow>,
    )
  }

  for (let i = 0; i < displayBlocks.length; i += 1) {
    const block = displayBlocks[i]
    if (block === undefined) continue
    if (isActivityBlock(block)) {
      if (group.length === 0) groupStart = i
      group.push(block)
      continue
    }
    flushGroup()
    switch (block.kind) {
      case 'text':
        rendered.push(
          <MarkdownText
            key={i}
            text={block.text}
            streaming={streaming}
            codeLabels={codeLabels}
            fileMentions={mentions}
          />,
        )
        break
      case 'image': {
        const start = i
        const images = [block]
        while (i + 1 < displayBlocks.length) {
          const next = displayBlocks[i + 1]
          if (next === undefined || next.kind !== 'image') break
          images.push(next)
          i += 1
        }
        rendered.push(
          <ImageGallery
            key={start}
            images={images}
            load={imageLoader}
            align="start"
            labels={messageImageLabels(t)}
          />,
        )
        break
      }
      case 'tool-call':
      case 'reasoning':
        break
      case 'other':
        rendered.push(
          <JsonBlock
            key={i}
            label={t('message.unknownBlock')}
            payload={block.block}
            truncatedLabel={total => t('json.truncated', { total })}
          />,
        )
        break
    }
  }
  flushGroup()

  return (
    <div className={css.root} data-streaming={streaming || undefined}>
      <div className={css.body}>
        {rendered}
        {interrupted && <span className={css.stopped}>{t('message.stopped')}</span>}
      </div>
    </div>
  )
})
