import type { ConversationLocation, StepLocation } from '@deepseek-ai/dsh-client-runtime/client'
import { describe, expect, it } from 'vitest'
import {
  collectTurnActivityItems,
  firstVisibleAssistantStepNumber,
  hasVisibleAssistantContent,
  insertMissingActivityTools,
  isAbsorbedToolCall,
  isActivityBlock,
  isActivityLive,
  isAssistantTurnActivityHost,
  isEditorOwnedTool,
  isToolHostedActivity,
  lastActivityIndex,
  liveReasoningItem,
  mergeActivityTiming,
} from '../src/client/activity.js'
import type { ThinkingTimingData } from '../src/client/timing.js'
import { THINKING_TIMING_KEY } from '../src/client/timing.js'

function stepLocation(input: {
  readonly callIds?: readonly string[]
  readonly assistantCallIds?: readonly { readonly callId: string; readonly name: string }[]
}): ConversationLocation {
  const timing: ThinkingTimingData | undefined = input.callIds === undefined
    ? undefined
    : {
        blocks: {},
        activity: undefined,
        callIds: input.callIds,
        pendingCallIds: [],
      }
  const assistant = input.assistantCallIds === undefined
    ? undefined
    : {
        status: 'running' as const,
        turn: 1,
        step: 1,
        blocks: input.assistantCallIds.map(call => ({
          kind: 'tool-call' as const,
          callId: call.callId,
          name: call.name,
          argsRaw: '{}',
        })),
        time: 1,
      }
  const step = {
    turn: 1,
    step: 1,
    data: {
      get(key: string) {
        if (key === THINKING_TIMING_KEY) return timing
        if (key === 'assistant-step') return assistant
        return undefined
      },
    },
  } as unknown as StepLocation
  return { kind: 'step', turn: { steps: [step] } as never, step }
}

describe('activity absorption', () => {
  it('treats ask_user_question as editor-owned and not absorbable', () => {
    expect(isEditorOwnedTool('ask_user_question')).toBe(true)
    expect(isActivityBlock({
      kind: 'tool-call',
      callId: 'q1',
      name: 'ask_user_question',
      argsRaw: '{}',
    })).toBe(false)
    expect(isAbsorbedToolCall(
      'q1',
      'ask_user_question',
      stepLocation({ callIds: ['q1'] }),
    )).toBe(false)
  })

  it('absorbs ordinary tools recorded on the step timing or assistant blocks', () => {
    expect(isAbsorbedToolCall(
      'c1',
      'bash',
      stepLocation({ callIds: ['c1'] }),
    )).toBe(true)
    expect(isAbsorbedToolCall(
      'c2',
      'read',
      stepLocation({ assistantCallIds: [{ callId: 'c2', name: 'read' }] }),
    )).toBe(true)
    expect(isAbsorbedToolCall(
      'c3',
      'bash',
      stepLocation({}),
    )).toBe(false)
  })

  it('keeps activity live while tools run even after reasoning ends', () => {
    expect(isActivityLive({
      hasAnswer: false,
      streaming: false,
      groupIncludesLastActivity: true,
      toolsRunning: true,
    })).toBe(true)
    expect(isActivityLive({
      hasAnswer: true,
      streaming: false,
      groupIncludesLastActivity: true,
      toolsRunning: true,
    })).toBe(false)
  })

  it('finds the last absorbable activity block', () => {
    expect(lastActivityIndex([
      { kind: 'reasoning', text: 'think' },
      { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' },
      { kind: 'tool-call', callId: 'q1', name: 'ask_user_question', argsRaw: '{}' },
      { kind: 'text', text: 'done' },
    ])).toBe(1)
  })

  it('treats tool-only assistant blocks as not visible, matching DSH', () => {
    expect(hasVisibleAssistantContent([
      { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' },
    ])).toBe(false)
    expect(hasVisibleAssistantContent([
      { kind: 'reasoning', text: 'think' },
    ])).toBe(true)
    expect(isToolHostedActivity(stepLocation({ callIds: ['c1'] }))).toBe(true)
    expect(isToolHostedActivity(stepLocation({
      callIds: ['c1'],
      assistantCallIds: [{ callId: 'c1', name: 'bash' }],
    }))).toBe(true)
  })

  it('inserts sibling tools before answer text when blocks omit them', () => {
    expect(insertMissingActivityTools(
      [{ kind: 'text', text: 'DONE' }],
      [{ kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' }],
    )).toEqual([
      { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' },
      { kind: 'text', text: 'DONE' },
    ])
  })

  it('merges step timings into one turn clock', () => {
    expect(mergeActivityTiming([
      { startedAt: 1_000, endedAt: 2_000 },
      undefined,
      { startedAt: 1_500, endedAt: null },
    ])).toEqual({ startedAt: 1_000, endedAt: null })
    expect(mergeActivityTiming([
      { startedAt: 2_000, endedAt: 4_000 },
      { startedAt: 1_000, endedAt: 6_000 },
    ])).toEqual({ startedAt: 1_000, endedAt: 6_000 })
  })

  it('collects reasoning and tools across steps and hosts the first visible assistant', () => {
    const reasoning = { kind: 'reasoning' as const, text: 'think later' }
    const items = collectTurnActivityItems([
      {
        step: 1,
        blocks: [{ kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' }],
        tools: [{ callId: 'c1', name: 'bash', argsRaw: '{}' }],
        timing: undefined,
      },
      {
        step: 2,
        blocks: [reasoning, { kind: 'text', text: 'DONE' }],
        tools: [],
        timing: {
          blocks: { 0: { startedAt: 3_000, endedAt: 4_000 } },
          activity: { startedAt: 3_000, endedAt: 4_000 },
          callIds: [],
          pendingCallIds: [],
        },
      },
    ])
    expect(items).toEqual([
      { kind: 'tool-call', step: 1, callId: 'c1', name: 'bash' },
      {
        kind: 'reasoning',
        step: 2,
        index: 0,
        text: 'think later',
        timing: { startedAt: 3_000, endedAt: 4_000 },
      },
    ])
    expect(firstVisibleAssistantStepNumber([
      { step: 1, blocks: [{ kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' }] },
      { step: 2, blocks: [reasoning, { kind: 'text', text: 'DONE' }] },
    ])).toBe(2)
    expect(isAssistantTurnActivityHost([
      { step: 1, blocks: [{ kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' }] },
      { step: 2, blocks: [reasoning] },
    ], 2)).toBe(true)
  })

  it('marks only the latest unfinished thought in a streaming step as live', () => {
    expect(liveReasoningItem([
      {
        kind: 'reasoning',
        step: 1,
        index: 0,
        text: 'first',
        timing: { startedAt: 1_000, endedAt: 2_000 },
      },
      { kind: 'tool-call', step: 1, callId: 'c1', name: 'bash' },
      {
        kind: 'reasoning',
        step: 1,
        index: 2,
        text: 'second',
        timing: { startedAt: 3_000, endedAt: null },
      },
    ], new Set([1]))).toMatchObject({ index: 2, text: 'second' })
  })
})
