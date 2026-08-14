import type {
  ConversationLocationData,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-llm-retry/types'

export const THINKING_TIMING_KEY = 'thinking-collapse-timing' as const

export interface ReasoningBlockTiming {
  readonly startedAt: number
  readonly endedAt: number | null
}

export interface ThinkingTimingData {
  readonly blocks: Readonly<Record<number, ReasoningBlockTiming>>
}

export interface ThinkingTimingState extends ThinkingTimingData {
  readonly turn: number
  readonly step: number
  readonly activeIndex: number | null
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationStepDataMap {
    'thinking-collapse-timing': ThinkingTimingData
  }
}

export type TimingInput =
  | { readonly type: 'reasoning-start'; readonly index: number; readonly time: number }
  | { readonly type: 'reasoning-end'; readonly index: number; readonly time: number }
  | { readonly type: 'non-reasoning-start'; readonly time: number }
  | { readonly type: 'step-end'; readonly time: number }
  | { readonly type: 'retry' }

export function createThinkingTimingState(turn: number, step: number): ThinkingTimingState {
  return { turn, step, activeIndex: null, blocks: {} }
}

function closeActive(state: ThinkingTimingState, time: number): ThinkingTimingState {
  const index = state.activeIndex
  if (index === null) return state
  const timing = state.blocks[index]
  if (timing === undefined || timing.endedAt !== null) {
    return { ...state, activeIndex: null }
  }
  return {
    ...state,
    activeIndex: null,
    blocks: {
      ...state.blocks,
      [index]: { ...timing, endedAt: Math.max(timing.startedAt, time) },
    },
  }
}

/** Replay-safe pure fold used by the client Conversation Definition. */
export function advanceThinkingTiming(
  state: ThinkingTimingState,
  input: TimingInput,
): ThinkingTimingState {
  switch (input.type) {
    case 'retry':
      return createThinkingTimingState(state.turn, state.step)
    case 'step-end':
    case 'non-reasoning-start':
      return closeActive(state, input.time)
    case 'reasoning-end': {
      const timing = state.blocks[input.index]
      if (timing === undefined || timing.endedAt !== null) return state
      return {
        ...state,
        activeIndex: state.activeIndex === input.index ? null : state.activeIndex,
        blocks: {
          ...state.blocks,
          [input.index]: {
            ...timing,
            endedAt: Math.max(timing.startedAt, input.time),
          },
        },
      }
    }
    case 'reasoning-start': {
      const closed = state.activeIndex === input.index ? state : closeActive(state, input.time)
      const existing = closed.blocks[input.index]
      if (existing !== undefined) {
        return existing.endedAt === null && closed.activeIndex !== input.index
          ? { ...closed, activeIndex: input.index }
          : closed
      }
      return {
        ...closed,
        activeIndex: input.index,
        blocks: {
          ...closed.blocks,
          [input.index]: { startedAt: input.time, endedAt: null },
        },
      }
    }
  }
}

function updateChunk(state: ThinkingTimingState, match: Parameters<NonNullable<ConversationNodeDefinition<ThinkingTimingState>['update']>>[1]): ThinkingTimingState {
  if (match.event.type !== 'assistant/chunk') return state
  const { chunk } = match.event.data
  switch (chunk.type) {
    case 'block-start':
      return advanceThinkingTiming(state, chunk.blockType === 'reasoning'
        ? { type: 'reasoning-start', index: chunk.index, time: match.event.time }
        : { type: 'non-reasoning-start', time: match.event.time })
    case 'reasoning-delta':
      return advanceThinkingTiming(state, {
        type: 'reasoning-start',
        index: chunk.index,
        time: match.event.time,
      })
    case 'block-end':
      return state.activeIndex === chunk.index
        ? advanceThinkingTiming(state, {
            type: 'reasoning-end',
            index: chunk.index,
            time: match.event.time,
          })
        : state
    case 'text-delta':
    case 'tool-call-delta':
      return advanceThinkingTiming(state, {
        type: 'non-reasoning-start',
        time: match.event.time,
      })
    case 'finish':
      return advanceThinkingTiming(state, { type: 'step-end', time: match.event.time })
    default:
      return state
  }
}

/** State-only Definition publishing precise reasoning timing on each Step. */
export const thinkingTimingDefinition: ConversationNodeDefinition<ThinkingTimingState> = {
  kind: THINKING_TIMING_KEY,
  match(event) {
    if (event.type === 'step/start') {
      return { id: `${event.data.turn}:${event.data.step}`, role: 'start' }
    }
    if (event.type === 'assistant/chunk'
      || event.type === 'step/end'
      || event.type === 'llm/retry'
      || (event.type === 'assistant/message' && event.surfaceOp === 'append')) {
      return { id: `${event.data.turn}:${event.data.step}`, role: 'update' }
    }
    return null
  },
  start(_context, match) {
    if (match.event.type !== 'step/start') {
      throw new Error('thinking timing start requires step/start')
    }
    return createThinkingTimingState(match.event.data.turn, match.event.data.step)
  },
  update(context, match) {
    if (match.event.type === 'assistant/chunk') return updateChunk(context.state, match)
    if (match.event.type === 'llm/retry') {
      return advanceThinkingTiming(context.state, { type: 'retry' })
    }
    if (match.event.type === 'step/end' || match.event.type === 'assistant/message') {
      return advanceThinkingTiming(context.state, {
        type: 'step-end',
        time: match.event.time,
      })
    }
    return context.state
  },
  publication(match) {
    return match.event.type === 'assistant/chunk' ? 'animation-frame' : 'immediate'
  },
  buildLocationData(context, scope): ConversationLocationData | null {
    const state = context.state
    if (scope !== 'step' || state === undefined) return null
    return {
      kind: 'step',
      turn: state.turn,
      step: state.step,
      key: THINKING_TIMING_KEY,
      value: { blocks: state.blocks },
    }
  },
}
