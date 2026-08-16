import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConversationLocation, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ToolCallNodeView } from '../src/client/ToolCallNodeView.js'
import type { ToolCallNodeViewProps } from '../src/client/ToolCallNodeView.js'
import { THINKING_TIMING_KEY } from '../src/client/timing.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronRightOutline14: () => <span data-testid="chevron-right" />,
  IconThinkOutline14: () => <span data-testid="think-icon" />,
  MarkdownText: ({ text }: { text: string }) => <div>{text}</div>,
  JsonBlock: ({ label }: { label: string }) => <div>{label}</div>,
  DisclosureRow: ({
    title,
    open,
  }: {
    title: string
    open: boolean
  }) => (
    <section>
      <button type="button" aria-expanded={open}>{title}</button>
    </section>
  ),
}))

vi.mock('../src/client/ToolCallTree.js', () => ({
  ToolCallTree: ({ block }: { block: { callId: string } }) => (
    <div data-testid="tool-tree">{block.callId}</div>
  ),
}))

const thinkingT = ((key: string, params?: Record<string, unknown>) => {
  const copy: Record<string, string> = {
    'status.history': '思考过程',
    'status.tools': '工具调用',
    'status.elapsed': '耗时 {duration}',
    'status.processed': '已处理 {duration}',
    'duration.seconds': '{seconds}秒',
    'duration.minutes': '{minutes}分钟 {seconds}秒',
    'duration.compactSeconds': '{seconds}s',
    'duration.compactMinutes': '{minutes}m {seconds}s',
  }
  return (copy[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name]))
}) as never

function locationWithCall(input: {
  readonly callId: string
  readonly assistantBlocks?: readonly { kind: string; text?: string; callId?: string; name?: string; argsRaw?: string }[]
  readonly pending?: boolean
  readonly activity?: { startedAt: number; endedAt: number | null }
}): ConversationLocation {
  return {
    kind: 'step',
    turn: { steps: [] } as never,
    step: {
      turn: 1,
      step: 1,
      data: {
        get(key: string) {
          if (key === THINKING_TIMING_KEY) {
            return {
              blocks: {},
              activity: input.activity,
              callIds: [input.callId],
              pendingCallIds: input.pending === true ? [input.callId] : [],
            }
          }
          if (key === 'assistant-step' && input.assistantBlocks !== undefined) {
            return {
              status: 'settled',
              turn: 1,
              step: 1,
              blocks: input.assistantBlocks,
              time: 1,
            }
          }
          return undefined
        },
      },
    },
  } as unknown as ConversationLocation
}

function toolRoot(callId: string, name = 'bash'): ToolCallBlock {
  return {
    callId,
    name,
    argsRaw: '{}',
    turn: 1,
    step: 1,
    time: 1,
    callView: null,
    subCalls: [],
  }
}

function settledRoot(callId: string, name = 'bash'): ToolCallBlock {
  return {
    kind: 'tool-result',
    seq: 2,
    time: 4,
    callId,
    call: { name, argsRaw: '{}' },
    callTime: 1,
    content: [],
    isError: false,
    callView: null,
    resultView: null,
    subCalls: [],
  }
}

function toolNode(input: {
  readonly callId: string
  readonly name: string
  readonly location: ConversationLocation
}): ChatNode<'tool-call'> {
  return {
    kind: 'tool-call',
    data: { root: toolRoot(input.callId, input.name) },
    location: input.location,
  } as ChatNode<'tool-call'>
}

function useSessionWithRoots(roots: readonly ToolCallBlock[]) {
  return vi.fn((select: (snapshot: {
    chat: {
      locations: { getStep: () => string[] }
      nodes: { get: (key: string) => { kind: 'tool-call'; data: { root: ToolCallBlock } } | undefined }
    }
  }) => unknown) => select({
    chat: {
      locations: { getStep: () => roots.map((_, index) => `t${index}`) },
      nodes: {
        get: (key: string) => {
          const root = roots[Number(key.slice(1))]
          return root === undefined ? undefined : { kind: 'tool-call', data: { root } }
        },
      },
    },
  }))
}

const slotProps = {
  slots: {
    entriesOfSlot: () => [],
    subscribe: () => () => {},
    getVersion: () => 0,
  },
  thinkingT,
  openFile: vi.fn(),
  inspectCall: vi.fn(),
  t: ((key: string) => key),
  useSession: vi.fn(),
  useInput: vi.fn(),
  inputActions: {},
  sessionId: 's1',
  useProjection: vi.fn(),
  useSessions: vi.fn(),
  useWorkspaces: vi.fn(),
  useTurnData: vi.fn(),
  loadImage: vi.fn(),
  fileMentions: vi.fn(),
  forkAt: vi.fn(),
} as unknown as Omit<ToolCallNodeViewProps, 'node'>

afterEach(() => {
  cleanup()
})

describe('ToolCallNodeView', () => {
  it('hides absorbed tools when the assistant-step already shows the activity row', () => {
    const { container } = render(
      <ToolCallNodeView
        {...slotProps}
        useSession={useSessionWithRoots([toolRoot('c1')]) as never}
        node={toolNode({
          callId: 'c1',
          name: 'bash',
          location: locationWithCall({
            callId: 'c1',
            assistantBlocks: [{ kind: 'reasoning', text: 'think' }],
          }),
        })}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('hosts a tools-only activity row when the assistant-step is hidden', () => {
    render(
      <ToolCallNodeView
        {...slotProps}
        useSession={useSessionWithRoots([settledRoot('c1')]) as never}
        node={toolNode({
          callId: 'c1',
          name: 'bash',
          location: locationWithCall({
            callId: 'c1',
            activity: { startedAt: 1_000, endedAt: 4_000 },
          }),
        })}
      />,
    )
    expect(screen.getByRole('button', { name: '耗时 3秒' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('tool-tree')).toBeNull()
  })

  it('keeps a tools-only activity row expanded while the tool is still running', () => {
    render(
      <ToolCallNodeView
        {...slotProps}
        useSession={useSessionWithRoots([toolRoot('c1')]) as never}
        node={toolNode({
          callId: 'c1',
          name: 'bash',
          location: locationWithCall({
            callId: 'c1',
            pending: true,
            activity: { startedAt: 1_000, endedAt: null },
          }),
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /已处理/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('tool-tree').textContent).toBe('c1')
  })

  it('lets only the first absorbed root on the step host the activity row', () => {
    const location = locationWithCall({ callId: 'c2', activity: { startedAt: 1_000, endedAt: 2_000 } })
    const { container } = render(
      <ToolCallNodeView
        {...slotProps}
        useSession={useSessionWithRoots([toolRoot('c1'), toolRoot('c2')]) as never}
        node={toolNode({
          callId: 'c2',
          name: 'bash',
          location,
        })}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('keeps editor-owned questions in the stream', () => {
    render(
      <ToolCallNodeView
        {...slotProps}
        node={toolNode({
          callId: 'q1',
          name: 'ask_user_question',
          location: locationWithCall({ callId: 'q1' }),
        })}
      />,
    )
    expect(screen.getByTestId('tool-tree').textContent).toBe('q1')
  })
})
