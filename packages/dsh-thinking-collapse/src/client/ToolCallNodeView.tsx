import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import {
  collectTurnActivityItems,
  firstVisibleAssistantStepNumber,
  isAbsorbedToolCall,
  isActivityLive,
  isRunningToolBlock,
  mergeActivityTiming,
  stepLocationsOf,
  toStepActivityTools,
  toolCallName,
  turnHasAnswer,
  type StepActivitySource,
} from './activity.js'
import type { THINKING_COLLAPSE_NS } from './locales.js'
import { ReasoningRow } from './ReasoningRow.js'
import { THINKING_TIMING_KEY } from './timing.js'
import { atomicKitFromChatNode } from './toolview.js'
import type { ToolViewSlots } from './toolview.js'
import {
  TurnActivityBody,
  absorbableToolRootsByStep,
  toolRootMap,
} from './TurnActivityBody.js'
import { ToolCallTree } from './ToolCallTree.js'

export interface ToolCallNodeViewProps extends ChatNodeViewProps<'tool-call'> {
  readonly slots: ToolViewSlots
  readonly thinkingT: TranslateNS<typeof THINKING_COLLAPSE_NS>
}

/**
 * Shadow the official tool-call Chat Node. Absorbed calls disappear from the
 * stream when an assistant-step already hosts the turn activity row. If the
 * whole turn's assistant-steps are hidden (tools only), the first absorbed
 * root in the turn hosts the row.
 */
export function ToolCallNodeView(props: ToolCallNodeViewProps) {
  const {
    node,
    selectedCallId,
    cwd,
    openFile,
    inspectCall,
    slots,
    thinkingT,
    useSession,
    t,
  } = props
  const root = node.data.root
  const name = toolCallName(root)
  const turn = node.location.kind === 'step' ? node.location.step.turn : 0
  const stepNo = node.location.kind === 'step' ? node.location.step.step : 0
  const stepLocs = stepLocationsOf(node.location)
  const stepNumbers = stepLocs.length > 0 ? stepLocs.map(item => item.step) : [stepNo]
  const toolRootsByStep = useSession(snapshot => absorbableToolRootsByStep(snapshot, turn, stepNumbers))
  const kit = atomicKitFromChatNode(props)
  const tree = (
    <ToolCallTree
      slots={slots}
      kit={kit}
      block={root}
      selectedCallId={selectedCallId}
      cwd={cwd}
      openFile={openFile}
      inspectCall={inspectCall}
    />
  )
  if (!isAbsorbedToolCall(root.callId, name, node.location)) return tree

  const sources: StepActivitySource[] = stepLocs.length > 0
    ? stepLocs.map(item => ({
        step: item.step,
        blocks: item.data.get('assistant-step')?.blocks ?? [],
        tools: toStepActivityTools(toolRootsByStep[item.step] ?? []),
        timing: item.data.get(THINKING_TIMING_KEY),
      }))
    : [{
        step: stepNo,
        blocks: [],
        tools: toStepActivityTools(toolRootsByStep[stepNo] ?? []),
        timing: node.location.kind === 'step'
          ? node.location.step.data.get(THINKING_TIMING_KEY)
          : undefined,
      }]
  if (firstVisibleAssistantStepNumber(sources) !== undefined) return null

  const turnRoots = stepNumbers.flatMap(number => toolRootsByStep[number] ?? [])
  if (turnRoots[0]?.callId !== root.callId) return null
  const items = collectTurnActivityItems(sources)
  const toolRoots = toolRootMap(turnRoots)
  const toolsRunning = turnRoots.some(isRunningToolBlock)
  const streamingSteps = new Set(
    stepLocs.flatMap(item => item.data.get('assistant-step')?.status === 'running' ? [item.step] : []),
  )
  if (streamingSteps.size === 0 && toolsRunning) streamingSteps.add(stepNo)
  const live = isActivityLive({
    hasAnswer: turnHasAnswer(sources),
    streaming: streamingSteps.size > 0,
    groupIncludesLastActivity: true,
    toolsRunning,
  })
  const thinkingTiming = mergeActivityTiming(sources.map(source => source.timing?.activity))
  const hasReasoning = items.some(item => item.kind === 'reasoning')
  const codeLabels = {
    copyLabel: t('copy'),
    copiedLabel: t('copied'),
  }

  return (
    <ReasoningRow
      live={live}
      active={live}
      timing={thinkingTiming}
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
  )
}
