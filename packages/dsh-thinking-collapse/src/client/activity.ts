import type {
  AssistantBlock,
  ConversationLocation,
  ConversationSnapshot,
  ToolCallBlock,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { THINKING_TIMING_KEY } from './timing.js'

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
  const steps = location.kind === 'step' ? [location.step] : location.turn.steps
  return steps.some(step => {
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
