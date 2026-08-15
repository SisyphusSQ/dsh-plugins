import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import {
  absorbableToolRoots,
  isAbsorbedToolCall,
  isActivityLive,
  isRunningToolBlock,
  isToolHostedActivity,
  toolCallName,
} from './activity.js'
import type { THINKING_COLLAPSE_NS } from './locales.js'
import { ReasoningRow } from './ReasoningRow.js'
import { THINKING_TIMING_KEY } from './timing.js'
import { atomicKitFromChatNode } from './toolview.js'
import type { ToolViewSlots } from './toolview.js'
import { ToolCallTree } from './ToolCallTree.js'
import rowCss from './ReasoningRow.module.css'

export interface ToolCallNodeViewProps extends ChatNodeViewProps<'tool-call'> {
  readonly slots: ToolViewSlots
  readonly thinkingT: TranslateNS<typeof THINKING_COLLAPSE_NS>
}

/**
 * Shadow the official tool-call Chat Node. Absorbed calls disappear from the
 * stream when the assistant-step already hosts the activity row. If that step
 * is hidden (tools only), the first absorbed root hosts the activity row.
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
  const hosted = useSession(snapshot => absorbableToolRoots(snapshot, turn, stepNo))
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
  if (!isToolHostedActivity(node.location) || node.location.kind !== 'step') return null
  if (hosted[0]?.callId !== root.callId) return null

  const toolsRunning = hosted.some(isRunningToolBlock)
  const assistant = node.location.step.data.get('assistant-step')
  const live = isActivityLive({
    hasAnswer: false,
    streaming: assistant?.status === 'running',
    groupIncludesLastActivity: true,
    toolsRunning,
  })
  const thinkingTiming = node.location.step.data.get(THINKING_TIMING_KEY)

  return (
    <ReasoningRow
      live={live}
      active={live}
      timing={thinkingTiming?.activity}
      historyKind="tools"
      t={t}
      thinkingT={thinkingT}
      codeLabels={{
        copyLabel: t('copy'),
        copiedLabel: t('copied'),
      }}
    >
      {hosted.map(block => (
        <div key={block.callId} className={rowCss.toolsBody}>
          <ToolCallTree
            slots={slots}
            kit={kit}
            block={block}
            selectedCallId={selectedCallId}
            cwd={cwd}
            openFile={openFile}
            inspectCall={inspectCall}
          />
        </div>
      ))}
    </ReasoningRow>
  )
}
