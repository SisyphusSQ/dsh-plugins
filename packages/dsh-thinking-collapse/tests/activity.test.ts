import type { ConversationLocation, StepLocation } from '@deepseek-ai/dsh-client-runtime/client'
import { describe, expect, it } from 'vitest'
import {
  hasVisibleAssistantContent,
  insertMissingActivityTools,
  isAbsorbedToolCall,
  isActivityBlock,
  isActivityLive,
  isEditorOwnedTool,
  isToolHostedActivity,
  lastActivityIndex,
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
})
