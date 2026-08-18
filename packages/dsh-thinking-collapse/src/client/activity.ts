import type {
  AssistantBlock,
  ConversationLocation,
  ConversationSnapshot,
  StepLocation,
  ToolCallBlock,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  THINKING_TIMING_KEY,
  type ActivityTiming,
  type ReasoningBlockTiming,
  type ThinkingTimingData,
} from './timing.js'

export type TurnActivityItem =
  | {
      readonly kind: 'reasoning'
      readonly step: number
      readonly index: number
      readonly text: string
      readonly timing: ReasoningBlockTiming | undefined
    }
  | {
      readonly kind: 'tool-call'
      readonly step: number
      readonly callId: string
      readonly name: string
    }

export interface StepActivitySource {
  readonly step: number
  readonly blocks: readonly AssistantBlock[]
  readonly tools: readonly Pick<Extract<AssistantBlock, { kind: 'tool-call' }>, 'callId' | 'name' | 'argsRaw'>[]
  readonly timing: ThinkingTimingData | undefined
}

/** Question / approval tools already occupy the composer, not the activity row. */
export const EDITOR_OWNED_TOOL_NAMES: ReadonlySet<string> = new Set(['ask_user_question'])

export function isEditorOwnedTool(name: string): boolean {
  return EDITOR_OWNED_TOOL_NAMES.has(name)
}

export function isAbsorbableToolName(name: string): boolean {
  return !isEditorOwnedTool(name)
}

export function isAnswerBlock(block: AssistantBlock): boolean {
  return block.kind === 'text' || block.kind === 'image' || block.kind === 'other'
}

export function isActivityBlock(block: AssistantBlock): boolean {
  return block.kind === 'reasoning'
    || (block.kind === 'tool-call' && isAbsorbableToolName(block.name))
}

export function lastActivityIndex(blocks: readonly AssistantBlock[]): number {
  let last = -1
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]
    if (block !== undefined && isActivityBlock(block)) last = i
  }
  return last
}

export function isActivityLive(input: {
  readonly hasAnswer: boolean
  readonly streaming: boolean
  readonly groupIncludesLastActivity: boolean
  readonly toolsRunning: boolean
}): boolean {
  return !input.hasAnswer
    && (input.toolsRunning || (input.streaming && input.groupIncludesLastActivity))
}

export function isSettledToolBlock(block: ToolCallBlock): block is Extract<ToolCallBlock, { kind: 'tool-result' }> {
  return 'kind' in block && block.kind === 'tool-result'
}

export function isRunningToolBlock(block: ToolCallBlock): boolean {
  return !isSettledToolBlock(block)
}

export function toolCallName(block: ToolCallBlock): string {
  return 'kind' in block ? block.call?.name ?? '' : block.name
}

/** Same visibility rule as DSH `hasVisibleContent`: tool-call blocks do not show the assistant-step. */
export function hasVisibleAssistantContent(blocks: readonly AssistantBlock[]): boolean {
  return blocks.some(block => {
    if (block.kind === 'tool-call') return false
    if (block.kind === 'text' || block.kind === 'reasoning') return block.text.trim() !== ''
    return true
  })
}

/** Hidden or missing assistant-step: the first absorbed tool node must host the activity row. */
export function isToolHostedActivity(location: ConversationLocation): boolean {
  if (location.kind !== 'step') return false
  const assistant = location.step.data.get('assistant-step')
  return assistant === undefined || !hasVisibleAssistantContent(assistant.blocks)
}

export function insertMissingActivityTools(
  blocks: readonly AssistantBlock[],
  extras: readonly AssistantBlock[],
): AssistantBlock[] {
  if (extras.length === 0) return [...blocks]
  const firstNonActivity = blocks.findIndex(block => !isActivityBlock(block))
  if (firstNonActivity === -1) return [...blocks, ...extras]
  if (firstNonActivity === 0) return [...extras, ...blocks]
  return [...blocks.slice(0, firstNonActivity), ...extras, ...blocks.slice(firstNonActivity)]
}

export function missingAbsorbableToolBlocks(
  blocks: readonly AssistantBlock[],
  tools: readonly Pick<Extract<AssistantBlock, { kind: 'tool-call' }>, 'callId' | 'name' | 'argsRaw'>[],
): AssistantBlock[] {
  const present = new Set(
    blocks.flatMap(block => block.kind === 'tool-call' ? [block.callId] : []),
  )
  return tools.flatMap(tool => {
    if (present.has(tool.callId) || !isAbsorbableToolName(tool.name)) return []
    return [{
      kind: 'tool-call' as const,
      callId: tool.callId,
      name: tool.name,
      argsRaw: tool.argsRaw,
    }]
  })
}

export function absorbableToolRoots(
  snapshot: ConversationSnapshot,
  turn: number,
  step: number,
): ToolCallBlock[] {
  const keys = snapshot.chat.locations.getStep(turn, step)
  const roots: ToolCallBlock[] = []
  for (const key of keys) {
    const node = snapshot.chat.nodes.get(key)
    if (node?.kind !== 'tool-call') continue
    const root = (node as ChatNode<'tool-call'>).data.root
    if (!isAbsorbableToolName(toolCallName(root))) continue
    roots.push(root)
  }
  return roots
}

export function isAbsorbedToolCall(
  callId: string,
  name: string,
  location: ConversationLocation,
): boolean {
  if (!isAbsorbableToolName(name)) return false
  if (location.kind !== 'step' && location.kind !== 'turn') return false
  return stepLocationsOf(location).some(step => {
    const timing = step.data.get(THINKING_TIMING_KEY)
    if (timing?.callIds.includes(callId) === true) return true
    const assistant = step.data.get('assistant-step')
    return assistant?.blocks.some(block => (
      block.kind === 'tool-call'
      && block.callId === callId
      && isAbsorbableToolName(block.name)
    )) === true
  })
}

export function stepLocationsOf(location: ConversationLocation): readonly StepLocation[] {
  if (location.kind === 'turn') return location.turn.steps
  if (location.kind !== 'step') return []
  return location.turn.steps.length > 0 ? location.turn.steps : [location.step]
}

export function mergeActivityTiming(
  timings: readonly (ActivityTiming | undefined)[],
): ActivityTiming | undefined {
  let startedAt: number | undefined
  let endedAt = 0
  let seen = false
  let open = false
  for (const timing of timings) {
    if (timing === undefined) continue
    seen = true
    startedAt = startedAt === undefined ? timing.startedAt : Math.min(startedAt, timing.startedAt)
    if (timing.endedAt === null) open = true
    else endedAt = Math.max(endedAt, timing.endedAt)
  }
  if (!seen || startedAt === undefined) return undefined
  return { startedAt, endedAt: open ? null : endedAt }
}

export function collectTurnActivityItems(
  sources: readonly StepActivitySource[],
): TurnActivityItem[] {
  const items: TurnActivityItem[] = []
  for (const source of sources) {
    const display = insertMissingActivityTools(
      source.blocks,
      missingAbsorbableToolBlocks(source.blocks, source.tools),
    )
    for (const block of display) {
      if (block.kind === 'reasoning') {
        const index = source.blocks.findIndex(candidate => candidate === block)
        const resolved = index === -1 ? 0 : index
        items.push({
          kind: 'reasoning',
          step: source.step,
          index: resolved,
          text: block.text,
          timing: source.timing?.blocks[resolved],
        })
        continue
      }
      if (block.kind === 'tool-call' && isAbsorbableToolName(block.name)) {
        items.push({
          kind: 'tool-call',
          step: source.step,
          callId: block.callId,
          name: block.name,
        })
      }
    }
  }
  return items
}

export function firstVisibleAssistantStepNumber(
  sources: readonly Pick<StepActivitySource, 'step' | 'blocks'>[],
): number | undefined {
  for (const source of sources) {
    if (hasVisibleAssistantContent(source.blocks)) return source.step
  }
  return undefined
}

export function isAssistantTurnActivityHost(
  sources: readonly Pick<StepActivitySource, 'step' | 'blocks'>[],
  currentStep: number,
): boolean {
  return firstVisibleAssistantStepNumber(sources) === currentStep
}

export function turnHasAnswer(
  sources: readonly Pick<StepActivitySource, 'blocks'>[],
): boolean {
  return sources.some(source => source.blocks.some(isAnswerBlock))
}

export function liveReasoningItem(
  items: readonly TurnActivityItem[],
  streamingSteps: ReadonlySet<number>,
): Extract<TurnActivityItem, { kind: 'reasoning' }> | undefined {
  let live: Extract<TurnActivityItem, { kind: 'reasoning' }> | undefined
  for (const item of items) {
    if (item.kind !== 'reasoning') continue
    if (!streamingSteps.has(item.step)) continue
    if (item.timing?.endedAt != null) continue
    live = item
  }
  return live
}

export function toolArgsRaw(block: ToolCallBlock): string {
  return 'kind' in block ? block.call?.argsRaw ?? '' : block.argsRaw
}

export function toStepActivityTools(
  roots: readonly ToolCallBlock[],
): StepActivitySource['tools'] {
  return roots.map(root => ({
    callId: root.callId,
    name: toolCallName(root),
    argsRaw: toolArgsRaw(root),
  }))
}
