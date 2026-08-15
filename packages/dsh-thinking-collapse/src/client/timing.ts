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

export type ActivityTiming = ReasoningBlockTiming

export interface ThinkingTimingData {
  readonly blocks: Readonly<Record<number, ReasoningBlockTiming>>
  readonly activity: ActivityTiming | undefined
  readonly callIds: readonly string[]
  readonly pendingCallIds: readonly string[]
}

export interface ThinkingTimingState {
  readonly turn: number
  readonly step: number
  readonly activeIndex: number | null
  readonly blocks: Readonly<Record<number, ReasoningBlockTiming>>
  readonly activityStartedAt: number | null
  readonly activityEndedAt: number | null
  readonly callIds: readonly string[]
  readonly pendingCallIds: readonly string[]
  readonly answerStarted: boolean
  readonly stepClosed: boolean
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
  | { readonly type: 'tool-start'; readonly time: number; readonly callId?: string | undefined; readonly pending?: boolean | undefined }
  | { readonly type: 'tool-result'; readonly time: number; readonly callId: string }
  | { readonly type: 'step-end'; readonly time: number }
  | { readonly type: 'retry' }

export function createThinkingTimingState(turn: number, step: number): ThinkingTimingState {
  return {
    turn,
    step,
    activeIndex: null,
    blocks: {},
    activityStartedAt: null,
    activityEndedAt: null,
    callIds: [],
    pendingCallIds: [],
    answerStarted: false,
    stepClosed: false,
  }
}

export function publishedThinkingTiming(state: ThinkingTimingState): ThinkingTimingData {
  return {
    blocks: state.blocks,
    activity: state.activityStartedAt === null
      ? undefined
      : { startedAt: state.activityStartedAt, endedAt: state.activityEndedAt },
    callIds: state.callIds,
    pendingCallIds: state.pendingCallIds,
  }
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

function ensureActivityStart(state: ThinkingTimingState, time: number): ThinkingTimingState {
  if (state.activityStartedAt !== null) return state
  return { ...state, activityStartedAt: time, activityEndedAt: null }
}

function maybeEndActivity(state: ThinkingTimingState, time: number): ThinkingTimingState {
  if (state.activityStartedAt === null || state.activityEndedAt !== null) return state
  if (state.pendingCallIds.length > 0) return state
  if (!state.answerStarted && !state.stepClosed) return state
  return { ...state, activityEndedAt: Math.max(state.activityStartedAt, time) }
}

function recordCall(
  state: ThinkingTimingState,
  callId: string,
  time: number,
  pending: boolean,
): ThinkingTimingState {
  const started = ensureActivityStart(state, time)
  const callIds = started.callIds.includes(callId)
    ? started.callIds
    : [...started.callIds, callId]
  const pendingCallIds = pending && !started.pendingCallIds.includes(callId)
    ? [...started.pendingCallIds, callId]
    : started.pendingCallIds
  const reopened = pending && started.activityEndedAt !== null
    ? { ...started, activityEndedAt: null }
    : started
  return { ...reopened, callIds, pendingCallIds }
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
      return maybeEndActivity(
        { ...closeActive(state, input.time), stepClosed: true },
        input.time,
      )
    case 'non-reasoning-start':
      return maybeEndActivity(
        { ...closeActive(state, input.time), answerStarted: true },
        input.time,
      )
    case 'tool-start': {
      const closed = closeActive(state, input.time)
      const started = ensureActivityStart(closed, input.time)
      return input.callId === undefined
        ? started
        : recordCall(started, input.callId, input.time, input.pending !== false)
    }
    case 'tool-result': {
      const pendingCallIds = state.pendingCallIds.filter(id => id !== input.callId)
      return maybeEndActivity({ ...state, pendingCallIds }, input.time)
    }
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
      const started = ensureActivityStart(closed, input.time)
      const existing = started.blocks[input.index]
      if (existing !== undefined) {
        return existing.endedAt === null && started.activeIndex !== input.index
          ? { ...started, activeIndex: input.index }
          : started
      }
      return {
        ...started,
        activeIndex: input.index,
        blocks: {
          ...started.blocks,
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
      if (chunk.blockType === 'reasoning') {
        return advanceThinkingTiming(state, {
          type: 'reasoning-start',
          index: chunk.index,
          time: match.event.time,
        })
      }
      if (chunk.blockType === 'tool-call') {
        return advanceThinkingTiming(state, { type: 'tool-start', time: match.event.time })
      }
      return advanceThinkingTiming(state, { type: 'non-reasoning-start', time: match.event.time })
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
      return advanceThinkingTiming(state, {
        type: 'non-reasoning-start',
        time: match.event.time,
      })
    case 'tool-call-delta':
      return advanceThinkingTiming(state, {
        type: 'tool-start',
        time: match.event.time,
        callId: String(chunk.id),
      })
    case 'finish':
      return advanceThinkingTiming(state, { type: 'step-end', time: match.event.time })
    default:
      return state
  }
}

function recordFinalToolCalls(state: ThinkingTimingState, match: Parameters<NonNullable<ConversationNodeDefinition<ThinkingTimingState>['update']>>[1]): ThinkingTimingState {
  if (match.event.type !== 'assistant/message') return state
  let next = state
  for (const block of match.event.data.message.content) {
    if (block.type !== 'tool-call') continue
    next = advanceThinkingTiming(next, {
      type: 'tool-start',
      time: match.event.time,
      callId: String(block.id),
      pending: false,
    })
  }
  return next
}

/** State-only Definition publishing precise reasoning and tool-activity timing on each Step. */
export const thinkingTimingDefinition: ConversationNodeDefinition<ThinkingTimingState> = {
  kind: THINKING_TIMING_KEY,
  match(event) {
    if (event.type === 'step/start') {
      return { id: `${event.data.turn}:${event.data.step}`, role: 'start' }
    }
    if (event.type === 'assistant/chunk'
      || event.type === 'step/end'
      || event.type === 'llm/retry'
      || event.type === 'tool/call'
      || event.type === 'tool/result'
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
    if (match.event.type === 'tool/call') {
      return advanceThinkingTiming(context.state, {
        type: 'tool-start',
        time: match.event.time,
        callId: String(match.event.data.callId),
      })
    }
    if (match.event.type === 'tool/result') {
      return advanceThinkingTiming(context.state, {
        type: 'tool-result',
        time: match.event.time,
        callId: String(match.event.data.message.source.callId),
      })
    }
    if (match.event.type === 'step/end' || match.event.type === 'assistant/message') {
      const withCalls = recordFinalToolCalls(context.state, match)
      return advanceThinkingTiming(withCalls, {
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
      value: publishedThinkingTiming(state),
    }
  },
}
