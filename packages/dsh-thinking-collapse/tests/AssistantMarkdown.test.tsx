import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { AssistantMarkdown } from '../src/client/AssistantMarkdown.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronRightOutline14: () => <span data-testid="chevron-right" />,
  IconThinkOutline14: () => <span data-testid="think-icon" />,
  MarkdownText: ({ text }: { text: string }) => <div data-testid="markdown">{text}</div>,
  JsonBlock: ({ label }: { label: string }) => <div>{label}</div>,
  DisclosureRow: ({
    title,
    open,
    onToggle,
    collapsedContent,
    children,
  }: {
    title: string
    open: boolean
    onToggle?: () => void
    collapsedContent?: ReactNode
    children?: ReactNode
  }) => (
    <section>
      <button type="button" aria-expanded={open} onClick={onToggle}>{title}</button>
      {!open && collapsedContent}
      {open && children}
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
    expect(document.querySelector('[data-activity="outer"]')?.getAttribute('data-state')).toBe('running')
    expect(document.querySelector('[data-activity="thought"]')?.getAttribute('data-state')).toBe('running')
    expect(screen.getByRole('button', { name: /已处理/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Think' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('private reasoning')).toBeTruthy()
    expect(screen.getByTestId('tool-tree').textContent).toBe('bash')
    expect(screen.queryByRole('button', { name: /耗时/ })).toBeNull()
    for (const button of screen.getAllByRole('button', { name: /已处理/ })) {
      expect(button.textContent).not.toContain('bash')
    }
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

  it('keeps settled thoughts collapsed inside the expanded turn row', () => {
    renderMarkdown({
      streaming: false,
      blocks: [
        { kind: 'reasoning', text: 'first thought\nhidden first' },
        { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' },
        { kind: 'reasoning', text: 'second thought\nhidden second' },
        { kind: 'text', text: 'final answer' },
      ],
      thinkingTiming: {
        blocks: {
          0: { startedAt: 1_000, endedAt: 2_000 },
          2: { startedAt: 4_000, endedAt: 5_000 },
        },
        activity: { startedAt: 1_000, endedAt: 6_000 },
        callIds: ['c1'],
        pendingCallIds: [],
      },
    })
    const outer = screen.getByRole('button', { name: '耗时 5秒' })
    expect(outer.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(outer)
    expect(outer.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('tool-tree').textContent).toBe('bash')
    expect(screen.getAllByRole('button', { name: 'Think' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /耗时/ })).toHaveLength(1)
    expect(screen.getByText('first thought')).toBeTruthy()
    expect(screen.getByText('second thought')).toBeTruthy()
    expect(screen.queryByText('hidden first')).toBeNull()
    expect(screen.queryByText('hidden second')).toBeNull()
    const thoughts = document.querySelectorAll('[data-activity="thought"] button')
    expect(thoughts).toHaveLength(2)
    expect(thoughts[0]?.getAttribute('aria-expanded')).toBe('false')
    expect(thoughts[1]?.getAttribute('aria-expanded')).toBe('false')
    expect(thoughts[0]?.textContent).toBe('Think')
    fireEvent.click(thoughts[0]!)
    expect(screen.getByText(/hidden first/)).toBeTruthy()
    expect(screen.queryByText('hidden second')).toBeNull()
    expect(screen.getByText('final answer')).toBeTruthy()
  })

  it('keeps native Think rows collapsed and previews the live latest line', () => {
    renderMarkdown({
      streaming: true,
      blocks: [
        { kind: 'reasoning', text: 'first thought\nhidden first' },
        { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' },
        { kind: 'reasoning', text: 'second thought\nlatest line' },
      ],
      thinkingTiming: {
        blocks: {
          0: { startedAt: 1_000, endedAt: 2_000 },
          2: { startedAt: 4_000, endedAt: null },
        },
        activity: { startedAt: 1_000, endedAt: null },
        callIds: ['c1'],
        pendingCallIds: ['c1'],
      },
    })
    expect(document.querySelector('[data-activity="outer"]')?.getAttribute('data-state')).toBe('running')
    expect(screen.getAllByRole('button', { name: 'Think' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /耗时/ })).toBeNull()
    expect(screen.getByText('first thought')).toBeTruthy()
    expect(screen.queryByText('hidden first')).toBeNull()
    expect(screen.queryByText('second thought')).toBeNull()
    expect(screen.getByText('latest line')).toBeTruthy()
    const thoughts = document.querySelectorAll('[data-activity="thought"]')
    expect(thoughts[0]?.getAttribute('data-state')).toBe('ok')
    expect(thoughts[1]?.getAttribute('data-state')).toBe('running')
    expect(thoughts[0]?.querySelector('button')?.getAttribute('aria-expanded')).toBe('false')
    expect(thoughts[1]?.querySelector('button')?.getAttribute('aria-expanded')).toBe('false')
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
