import { memo, useMemo } from 'react'
import type { ReactNode } from 'react'
import type {
  AssistantBlock,
  ConversationLocation,
  ConversationSnapshot,
  StepLocation,
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
  collectTurnActivityItems,
  isActivityBlock,
  isActivityLive,
  isAssistantTurnActivityHost,
  isRunningToolBlock,
  mergeActivityTiming,
  stepLocationsOf,
  toStepActivityTools,
  turnHasAnswer,
  type StepActivitySource,
} from './activity.js'
import { THINKING_TIMING_KEY } from './timing.js'
import type { ThinkingTimingData } from './timing.js'
import { ReasoningRow } from './ReasoningRow.js'
import {
  TurnActivityBody,
  absorbableToolRootsByStep,
  toolRootMap,
} from './TurnActivityBody.js'
import css from './AssistantMarkdown.module.css'

export interface AssistantMarkdownProps {
  readonly blocks: readonly AssistantBlock[]
  readonly streaming: boolean
  readonly interrupted?: boolean | undefined
  readonly loadImage?: ImageLoader
  readonly mentions?: MarkdownFileMentions | undefined
  readonly thinkingTiming?: ThinkingTimingData | undefined
  readonly turn: number
  readonly step: number
  readonly location?: ConversationLocation | undefined
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
  location,
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
  const stepLocs = location === undefined ? [] : stepLocationsOf(location)
  const stepNumbers = stepLocs.length > 0 ? stepLocs.map(item => item.step) : [step]
  const toolRootsByStep = useSession(snapshot => absorbableToolRootsByStep(snapshot, turn, stepNumbers))
  const sources = useMemo<StepActivitySource[]>(() => {
    if (stepLocs.length === 0) {
      return [{
        step,
        blocks,
        tools: toStepActivityTools(toolRootsByStep[step] ?? []),
        timing: thinkingTiming,
      }]
    }
    return stepLocs.map(item => {
      const assistant = item.data.get('assistant-step')
      return {
        step: item.step,
        blocks: item.step === step ? blocks : assistant?.blocks ?? [],
        tools: toStepActivityTools(toolRootsByStep[item.step] ?? []),
        timing: item.step === step ? thinkingTiming : item.data.get(THINKING_TIMING_KEY),
      }
    })
  }, [blocks, step, stepLocs, thinkingTiming, toolRootsByStep])
  const items = useMemo(() => collectTurnActivityItems(sources), [sources])
  const toolRoots = useMemo(() => {
    const roots: ToolCallBlock[] = []
    for (const number of stepNumbers) roots.push(...(toolRootsByStep[number] ?? []))
    return toolRootMap(roots)
  }, [stepNumbers, toolRootsByStep])
  const host = isAssistantTurnActivityHost(sources, step)
  const answers = renderAnswerBlocks(blocks, {
    streaming,
    imageLoader,
    mentions,
    t,
  })
  if (!host) {
    if (answers.length === 0 && interrupted !== true) return null
    return (
      <div className={css.root} data-streaming={streaming || undefined}>
        <div className={css.body}>
          {answers}
          {interrupted && <span className={css.stopped}>{t('message.stopped')}</span>}
        </div>
      </div>
    )
  }

  const hasAnswer = turnHasAnswer(sources)
  const toolsRunning = items.some(item => {
    if (item.kind !== 'tool-call') return false
    const root = toolRoots[item.callId]
    return root !== undefined && isRunningToolBlock(root)
  })
  const streamingSteps = streamingStepsOf(stepLocs, step, streaming)
  const live = isActivityLive({
    hasAnswer,
    streaming: streamingSteps.size > 0,
    groupIncludesLastActivity: true,
    toolsRunning,
  })
  const hasReasoning = items.some(item => item.kind === 'reasoning')
  const timing = mergeActivityTiming(sources.map(source => source.timing?.activity))

  return (
    <div className={css.root} data-streaming={streaming || undefined}>
      <div className={css.body}>
        {items.length > 0 && (
          <ReasoningRow
            live={live}
            active={live}
            timing={timing}
            historyKind={hasReasoning ? 'reasoning' : 'tools'}
            t={t}
            thinkingT={thinkingT}
            codeLabels={codeLabels}
          >
            <TurnActivityBody
              items={items}
              toolRoots={toolRoots}
              streamingSteps={streamingSteps}
              slots={slots}
              kit={kit}
              selectedCallId={selectedCallId}
              cwd={cwd}
              openFile={openFile}
              inspectCall={inspectCall}
              t={t}
            />
          </ReasoningRow>
        )}
        {answers}
        {interrupted && <span className={css.stopped}>{t('message.stopped')}</span>}
      </div>
    </div>
  )
})

function streamingStepsOf(
  stepLocs: readonly StepLocation[],
  currentStep: number,
  currentStreaming: boolean,
): Set<number> {
  const next = new Set<number>()
  if (stepLocs.length === 0) {
    if (currentStreaming) next.add(currentStep)
    return next
  }
  for (const loc of stepLocs) {
    if (loc.step === currentStep) {
      if (currentStreaming) next.add(loc.step)
      continue
    }
    if (loc.data.get('assistant-step')?.status === 'running') next.add(loc.step)
  }
  return next
}

function renderAnswerBlocks(
  blocks: readonly AssistantBlock[],
  input: {
    readonly streaming: boolean
    readonly imageLoader: ImageLoader
    readonly mentions: MarkdownFileMentions | undefined
    readonly t: ChatViewSlotProps['t']
  },
): ReactNode[] {
  const rendered: ReactNode[] = []
  const codeLabels = {
    copyLabel: input.t('copy'),
    copiedLabel: input.t('copied'),
  }
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]
    if (block === undefined || isActivityBlock(block)) continue
    switch (block.kind) {
      case 'text':
        rendered.push(
          <MarkdownText
            key={i}
            text={block.text}
            streaming={input.streaming}
            codeLabels={codeLabels}
            fileMentions={input.mentions}
          />,
        )
        break
      case 'image': {
        const start = i
        const images = [block]
        while (i + 1 < blocks.length) {
          const next = blocks[i + 1]
          if (next === undefined || next.kind !== 'image') break
          images.push(next)
          i += 1
        }
        rendered.push(
          <ImageGallery
            key={start}
            images={images}
            load={input.imageLoader}
            align="start"
            labels={messageImageLabels(input.t)}
          />,
        )
        break
      }
      case 'other':
        rendered.push(
          <JsonBlock
            key={i}
            label={input.t('message.unknownBlock')}
            payload={block.block}
            truncatedLabel={total => input.t('json.truncated', { total })}
          />,
        )
        break
      default:
        break
    }
  }
  return rendered
}
