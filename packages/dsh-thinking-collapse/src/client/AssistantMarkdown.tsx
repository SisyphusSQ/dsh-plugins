import { Fragment, memo, useMemo } from 'react'
import type { ReactNode } from 'react'
import type {
  AssistantBlock,
  ConversationLocation,
  MessageImageSource,
  RenderMessageImages,
  StepLocation,
  ToolCallBlock,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AssistantChatData, ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { MarkdownFileMentions, MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import { JsonBlock, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type { AtomicToolViewKit, ToolViewSlots } from './toolview.js'
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
  /** Chat-owned image-group renderer; the attachment plugin supplies the gallery. */
  readonly renderMessageImages: RenderMessageImages
  readonly mentions?: MarkdownFileMentions | undefined
  readonly thinkingTiming?: ThinkingTimingData | undefined
  readonly turn: number
  readonly step: number
  readonly location?: ConversationLocation | undefined
  readonly slots: ToolViewSlots
  readonly kit: AtomicToolViewKit
  readonly useChat: ChatNodeViewProps['useChat']
  /** This Step's assistant source, forwarded to preparing Tool rows. */
  readonly assistant?: HostObservable<Readonly<AssistantChatData> | undefined> | undefined
  readonly cwd?: string | undefined
  readonly openFile: ChatNodeViewProps['openFile']
  readonly inspectCall: ChatNodeViewProps['inspectCall']
  readonly t: TranslateNS<'chat'>
  readonly thinkingT: TranslateNS<typeof THINKING_COLLAPSE_NS>
}

/** Upstream Assistant block behavior with the activity row replaced. */
export const AssistantMarkdown = memo(function AssistantMarkdown({
  blocks,
  streaming,
  interrupted,
  renderMessageImages,
  mentions,
  thinkingTiming,
  turn,
  step,
  location,
  slots,
  kit,
  useChat,
  assistant,
  cwd,
  openFile,
  inspectCall,
  t,
  thinkingT,
}: AssistantMarkdownProps) {
  const labels = useMemo<MarkdownLabels>(() => ({
    code: {
      copyLabel: t('copy'),
      copiedLabel: t('copied'),
    },
    footnotes: t('markdown.footnotes'),
  }), [t])
  const stepLocs = location === undefined ? [] : stepLocationsOf(location)
  const stepNumbers = stepLocs.length > 0 ? stepLocs.map(item => item.step) : [step]
  const toolRootsByStep = useChat(chat => absorbableToolRootsByStep(chat, turn, stepNumbers))
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
    renderMessageImages,
    mentions,
    labels,
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
            codeLabels={labels.code}
          >
            <TurnActivityBody
              items={items}
              toolRoots={toolRoots}
              streamingSteps={streamingSteps}
              slots={slots}
              kit={kit}
              assistant={assistant}
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
    readonly renderMessageImages: RenderMessageImages
    readonly mentions: MarkdownFileMentions | undefined
    readonly labels: MarkdownLabels
    readonly t: TranslateNS<'chat'>
  },
): ReactNode[] {
  const rendered: ReactNode[] = []
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
            labels={input.labels}
            fileMentions={input.mentions}
          />,
        )
        break
      case 'image': {
        const start = i
        const images: MessageImageSource[] = [{ attachment: block.attachment }]
        while (i + 1 < blocks.length) {
          const next = blocks[i + 1]
          if (next === undefined || next.kind !== 'image') break
          images.push({ attachment: next.attachment })
          i += 1
        }
        rendered.push(
          <Fragment key={start}>
            {input.renderMessageImages({ images, align: 'start' })}
          </Fragment>,
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
