import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { AssistantMarkdown } from '../src/client/AssistantMarkdown.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronRightOutline14: () => <span data-testid="chevron-right" />,
  MarkdownText: ({ text }: { text: string }) => <div data-testid="markdown">{text}</div>,
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

vi.mock('@deepseek-ai/dsh-client-ui-attachment', () => ({
  ImageGallery: () => null,
}))

vi.mock('../src/client/ToolCallTree.js', () => ({
  ToolCallTree: ({ block }: { block: ToolCallBlock }) => (
    <div data-testid="tool-tree">{'name' in block ? block.name : block.callId}</div>
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

const bashCall: ToolCallBlock = {
  callId: 'c1',
  name: 'bash',
  argsRaw: '{"command":"ls"}',
  turn: 1,
  step: 1,
  time: 1,
  callView: null,
  subCalls: [],
}

const settledBash: ToolCallBlock = {
  kind: 'tool-result',
  seq: 2,
  time: 4,
  callId: 'c1',
  call: { name: 'bash', argsRaw: '{"command":"ls"}' },
  callTime: 1,
  content: [],
  isError: false,
  callView: null,
  resultView: null,
  subCalls: [],
}

function renderMarkdown(
  overrides: Partial<Parameters<typeof AssistantMarkdown>[0]> = {},
  root: ToolCallBlock = bashCall,
) {
  const useSession = vi.fn((select: (snapshot: {
    chat: {
      locations: { getStep: () => string[] }
      nodes: { get: (key: string) => { kind: 'tool-call'; data: { root: ToolCallBlock } } }
    }
  }) => unknown) => select({
    chat: {
      locations: { getStep: () => ['tool'] },
      nodes: {
        get: () => ({ kind: 'tool-call', data: { root } }),
      },
    },
  }))
  return render(
    <AssistantMarkdown
      blocks={[
        { kind: 'reasoning', text: 'private reasoning' },
        { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' },
      ]}
      streaming
      turn={1}
      step={1}
      slots={{
        entriesOfSlot: () => [],
        subscribe: () => () => {},
        getVersion: () => 0,
      }}
      kit={{
        t: ((key: string) => key) as never,
        sessionId: 's1' as never,
        useSession: useSession as never,
        useProjection: vi.fn() as never,
        useSessions: vi.fn() as never,
        useWorkspaces: vi.fn() as never,
        useInput: vi.fn() as never,
        inputActions: {} as never,
      }}
      useSession={useSession as never}
      openFile={vi.fn()}
      inspectCall={vi.fn()}
      t={((key: string) => key) as never}
      thinkingT={thinkingT}
      thinkingTiming={{
        blocks: { 0: { startedAt: 1_000, endedAt: null } },
        activity: { startedAt: 1_000, endedAt: null },
        callIds: ['c1'],
        pendingCallIds: ['c1'],
      }}
      {...overrides}
    />,
  )
}

afterEach(() => {
  cleanup()
})

describe('AssistantMarkdown activity row', () => {
  it('draws streaming tools inside the activity body instead of after it', () => {
    renderMarkdown()
    expect(screen.getByText('private reasoning')).toBeTruthy()
    expect(screen.getByTestId('tool-tree').textContent).toBe('bash')
    expect(screen.getByRole('button', { name: /已处理/ }).textContent).not.toContain('bash')
  })

  it('leaves answer text outside the collapsed activity row', () => {
    renderMarkdown({
      streaming: false,
      blocks: [
        { kind: 'reasoning', text: 'private reasoning' },
        { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' },
        { kind: 'text', text: 'final answer' },
      ],
      thinkingTiming: {
        blocks: { 0: { startedAt: 1_000, endedAt: 2_000 } },
        activity: { startedAt: 1_000, endedAt: 4_000 },
        callIds: ['c1'],
        pendingCallIds: [],
      },
    })
    expect(screen.getByRole('button', { name: '耗时 3秒' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('private reasoning')).toBeNull()
    expect(screen.queryByTestId('tool-tree')).toBeNull()
    expect(screen.getByText('final answer')).toBeTruthy()
  })

  it('leaves tools-only steps empty so the absorbed tool node can host the row', () => {
    const { container } = renderMarkdown({
      streaming: false,
      blocks: [{ kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' }],
      thinkingTiming: {
        blocks: {},
        activity: undefined,
        callIds: ['c1'],
        pendingCallIds: [],
      },
    }, settledBash)
    expect(container.textContent).toBe('')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('does not fold editor-owned questions into the activity row', () => {
    renderMarkdown({
      blocks: [
        { kind: 'reasoning', text: 'private reasoning' },
        { kind: 'tool-call', callId: 'q1', name: 'ask_user_question', argsRaw: '{}' },
      ],
    }, {
      callId: 'q1',
      name: 'ask_user_question',
      argsRaw: '{}',
      turn: 1,
      step: 1,
      time: 1,
      callView: null,
      subCalls: [],
    })
    expect(screen.getByText('private reasoning')).toBeTruthy()
    expect(screen.queryByTestId('tool-tree')).toBeNull()
  })

  it('still renders a tools-only activity row when blocks only have the answer', () => {
    renderMarkdown({
      streaming: false,
      blocks: [{ kind: 'text', text: 'DONE' }],
      thinkingTiming: {
        blocks: {},
        activity: { startedAt: 1_000, endedAt: 4_000 },
        callIds: ['c1'],
        pendingCallIds: [],
      },
    }, settledBash)
    expect(screen.getByRole('button', { name: '耗时 3秒' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('tool-tree')).toBeNull()
    expect(screen.getByText('DONE')).toBeTruthy()
  })
})
