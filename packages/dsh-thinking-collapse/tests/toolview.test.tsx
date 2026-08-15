import { memo } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { AtomicToolView } from '../src/client/toolview.js'
import type { AtomicToolViewKit, ToolViewSlots } from '../src/client/toolview.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  JsonBlock: ({ label }: { label: string }) => <div data-testid="json-fallback">{label}</div>,
}))

afterEach(() => {
  cleanup()
})

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

const owner: ToolCallOwnerProps = {
  callId: 'c1',
  toolName: 'bash',
  block: bashCall,
  openFile: () => {},
}

const kit: AtomicToolViewKit = {
  t: ((key: string) => key) as never,
  sessionId: 's1' as never,
  useSession: (() => undefined) as never,
  useProjection: (() => undefined) as never,
  useSessions: (() => undefined) as never,
  useWorkspaces: (() => undefined) as never,
  useInput: (() => undefined) as never,
  inputActions: {} as never,
}

function createSlots(entries: ReadonlyArray<{ key: string; component: unknown }>): ToolViewSlots & {
  bump: (next: ReadonlyArray<{ key: string; component: unknown }>) => void
} {
  let current = entries
  let version = 1
  const listeners = new Set<() => void>()
  return {
    entriesOfSlot: () => current.map(entry => ({
      component: entry.component,
      options: { key: entry.key },
    })) as ReturnType<ToolViewSlots['entriesOfSlot']>,
    subscribe: (_key, fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    getVersion: () => version,
    bump(next) {
      current = next
      version += 1
      for (const listener of listeners) listener()
    },
  }
}

describe('AtomicToolView', () => {
  it('renders the keyed official toolview when the tool name matches', () => {
    const BashView = ({ toolName }: { toolName: string }) => (
      <div data-testid="official-view">{toolName}</div>
    )
    render(
      <AtomicToolView
        owner={owner}
        kit={kit}
        slots={createSlots([{ key: 'bash', component: BashView }])}
      />,
    )
    expect(screen.getByTestId('official-view').textContent).toBe('bash')
  })

  it('renders memo toolviews, not only plain functions', () => {
    const BashView = memo(({ toolName }: { toolName: string }) => (
      <div data-testid="memo-view">{toolName}</div>
    ))
    render(
      <AtomicToolView
        owner={owner}
        kit={kit}
        slots={createSlots([{ key: 'bash', component: BashView }])}
      />,
    )
    expect(screen.getByTestId('memo-view').textContent).toBe('bash')
  })

  it('falls back to JsonBlock when no keyed entry matches', () => {
    render(
      <AtomicToolView
        owner={owner}
        kit={kit}
        slots={createSlots([])}
      />,
    )
    expect(screen.getByTestId('json-fallback').textContent).toBe('bash')
  })

  it('picks up a later-registered keyed entry', () => {
    const slots = createSlots([])
    render(<AtomicToolView owner={owner} kit={kit} slots={slots} />)
    expect(screen.getByTestId('json-fallback')).toBeTruthy()
    expect(screen.queryByTestId('late-view')).toBeNull()

    act(() => {
      slots.bump([{
        key: 'bash',
        component: ({ toolName }: { toolName: string }) => (
          <div data-testid="late-view">{toolName}</div>
        ),
      }])
    })
    expect(screen.getByTestId('late-view').textContent).toBe('bash')
  })
})
