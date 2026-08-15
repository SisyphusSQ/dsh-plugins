import { describe, expect, it } from 'vitest'
import {
  advanceThinkingTiming,
  createThinkingTimingState,
} from '../src/client/timing.js'

describe('thinking timing fold', () => {
  it('records an explicit reasoning lifecycle', () => {
    let state = createThinkingTimingState(2, 3)
    state = advanceThinkingTiming(state, { type: 'reasoning-start', index: 0, time: 1_000 })
    state = advanceThinkingTiming(state, { type: 'reasoning-end', index: 0, time: 4_250 })

    expect(state.activeIndex).toBeNull()
    expect(state.blocks[0]).toEqual({ startedAt: 1_000, endedAt: 4_250 })
  })

  it('closes reasoning when a provider starts the next block without block-end', () => {
    let state = createThinkingTimingState(1, 1)
    state = advanceThinkingTiming(state, { type: 'reasoning-start', index: 0, time: 2_000 })
    state = advanceThinkingTiming(state, { type: 'non-reasoning-start', time: 5_000 })

    expect(state.blocks[0]).toEqual({ startedAt: 2_000, endedAt: 5_000 })
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
  })

  it('drops timings from an attempt hidden by retry', () => {
    let state = createThinkingTimingState(4, 2)
    state = advanceThinkingTiming(state, { type: 'reasoning-start', index: 0, time: 10_000 })
    state = advanceThinkingTiming(state, { type: 'retry' })

    expect(state).toEqual(createThinkingTimingState(4, 2))
  })

  it('clamps an out-of-order closing timestamp to the start', () => {
    let state = createThinkingTimingState(1, 1)
    state = advanceThinkingTiming(state, { type: 'reasoning-start', index: 0, time: 5_000 })
    state = advanceThinkingTiming(state, { type: 'reasoning-end', index: 0, time: 4_000 })

    expect(state.blocks[0]).toEqual({ startedAt: 5_000, endedAt: 5_000 })
  })
})
