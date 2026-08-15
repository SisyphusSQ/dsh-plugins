import { describe, expect, it } from 'vitest'
import {
  advanceThinkingTiming,
  createThinkingTimingState,
  publishedThinkingTiming,
  thinkingTimingDefinition,
} from '../src/client/timing.js'

describe('thinking timing fold', () => {
  it('records an explicit reasoning lifecycle', () => {
    let state = createThinkingTimingState(2, 3)
    state = advanceThinkingTiming(state, { type: 'reasoning-start', index: 0, time: 1_000 })
    state = advanceThinkingTiming(state, { type: 'reasoning-end', index: 0, time: 4_250 })

    expect(state.activeIndex).toBeNull()
    expect(state.blocks[0]).toEqual({ startedAt: 1_000, endedAt: 4_250 })
    expect(state.activityStartedAt).toBe(1_000)
    expect(state.activityEndedAt).toBeNull()
  })

  it('closes reasoning when a provider starts the next block without block-end', () => {
    let state = createThinkingTimingState(1, 1)
    state = advanceThinkingTiming(state, { type: 'reasoning-start', index: 0, time: 2_000 })
    state = advanceThinkingTiming(state, { type: 'non-reasoning-start', time: 5_000 })

    expect(state.blocks[0]).toEqual({ startedAt: 2_000, endedAt: 5_000 })
    expect(state.activityEndedAt).toBe(5_000)
  })

  it('keeps activity open when a tool call starts', () => {
    let state = createThinkingTimingState(1, 1)
    state = advanceThinkingTiming(state, { type: 'reasoning-start', index: 0, time: 1_000 })
    state = advanceThinkingTiming(state, { type: 'tool-start', time: 2_000, callId: 'call-1' })

    expect(state.blocks[0]).toEqual({ startedAt: 1_000, endedAt: 2_000 })
    expect(state.callIds).toEqual(['call-1'])
    expect(state.pendingCallIds).toEqual(['call-1'])
    expect(state.activityStartedAt).toBe(1_000)
    expect(state.activityEndedAt).toBeNull()
  })

  it('does not end activity on text while tools are still pending', () => {
    let state = createThinkingTimingState(1, 1)
    state = advanceThinkingTiming(state, { type: 'reasoning-start', index: 0, time: 1_000 })
    state = advanceThinkingTiming(state, { type: 'tool-start', time: 2_000, callId: 'call-1' })
    state = advanceThinkingTiming(state, { type: 'non-reasoning-start', time: 3_000 })

    expect(state.answerStarted).toBe(true)
    expect(state.activityEndedAt).toBeNull()
  })

  it('extends activity through tool results after the step ends', () => {
    let state = createThinkingTimingState(1, 1)
    state = advanceThinkingTiming(state, { type: 'tool-start', time: 1_000, callId: 'call-1' })
    state = advanceThinkingTiming(state, { type: 'step-end', time: 1_500 })
    expect(state.activityEndedAt).toBeNull()

    state = advanceThinkingTiming(state, { type: 'tool-result', time: 4_000, callId: 'call-1' })
    expect(state.pendingCallIds).toEqual([])
    expect(state.activityEndedAt).toBe(4_000)
    expect(publishedThinkingTiming(state).activity).toEqual({ startedAt: 1_000, endedAt: 4_000 })
  })

  it('records finalized tool ids without marking them pending', () => {
    let state = createThinkingTimingState(1, 1)
    state = advanceThinkingTiming(state, {
      type: 'tool-start',
      time: 2_000,
      callId: 'hist-1',
      pending: false,
    })
    state = advanceThinkingTiming(state, { type: 'step-end', time: 3_000 })

    expect(state.callIds).toEqual(['hist-1'])
    expect(state.pendingCallIds).toEqual([])
    expect(state.activityEndedAt).toBe(3_000)
  })

  it('tracks multiple reasoning blocks independently', () => {
    let state = createThinkingTimingState(1, 1)
    state = advanceThinkingTiming(state, { type: 'reasoning-start', index: 0, time: 1_000 })
    state = advanceThinkingTiming(state, { type: 'reasoning-end', index: 0, time: 2_000 })
    state = advanceThinkingTiming(state, { type: 'reasoning-start', index: 2, time: 3_000 })
    state = advanceThinkingTiming(state, { type: 'step-end', time: 6_000 })

    expect(state.blocks).toEqual({
      0: { startedAt: 1_000, endedAt: 2_000 },
      2: { startedAt: 3_000, endedAt: 6_000 },
    })
    expect(state.activityStartedAt).toBe(1_000)
    expect(state.activityEndedAt).toBe(6_000)
  })

  it('drops timings from an attempt hidden by retry', () => {
    let state = createThinkingTimingState(4, 2)
    state = advanceThinkingTiming(state, { type: 'reasoning-start', index: 0, time: 10_000 })
    state = advanceThinkingTiming(state, { type: 'tool-start', time: 11_000, callId: 'call-1' })
    state = advanceThinkingTiming(state, { type: 'retry' })

    expect(state).toEqual(createThinkingTimingState(4, 2))
  })

  it('clamps an out-of-order closing timestamp to the start', () => {
    let state = createThinkingTimingState(1, 1)
    state = advanceThinkingTiming(state, { type: 'reasoning-start', index: 0, time: 5_000 })
    state = advanceThinkingTiming(state, { type: 'reasoning-end', index: 0, time: 4_000 })

    expect(state.blocks[0]).toEqual({ startedAt: 5_000, endedAt: 5_000 })
  })

  it('matches tool lifecycle events onto the owning step', () => {
    expect(thinkingTimingDefinition.match({
      type: 'tool/call',
      seq: 8,
      time: 1_000,
      data: { turn: 3, step: 1, callId: 'c1', name: 'bash', arguments: '{}' },
    } as never)).toEqual({ id: '3:1', role: 'update' })
    expect(thinkingTimingDefinition.match({
      type: 'tool/result',
      seq: 9,
      time: 2_000,
      data: {
        turn: 3,
        step: 1,
        message: { source: { kind: 'tool', callId: 'c1' } },
      },
    } as never)).toEqual({ id: '3:1', role: 'update' })
  })
})
