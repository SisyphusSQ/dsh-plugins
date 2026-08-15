import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronRightOutline14: () => <span data-testid="chevron-right" />,
  MarkdownText: ({ text }: { text: string }) => <div data-testid="reasoning-markdown">{text}</div>,
  DisclosureRow: ({
    icon,
    title,
    open,
    onToggle,
    children,
  }: {
    icon: ReactNode
    title: string
    open: boolean
    onToggle: () => void
    children: ReactNode
  }) => (
    <section>
      <button type="button" onClick={onToggle} aria-expanded={open}>
        {title}
        {!open && icon}
      </button>
      {open && <div>{children}</div>}
    </section>
  ),
}))

import {
  formatCompactThinkingDuration,
  formatThinkingDuration,
  ReasoningRow,
} from '../src/client/ReasoningRow.js'

const t = ((key: string) => key) as never
const thinkingT = ((key: string, params?: Record<string, unknown>) => {
  const copy: Record<string, string> = {
    'status.history': '思考过程',
    'status.elapsed': '耗时 {duration}',
    'status.processed': '已处理 {duration}',
    'duration.seconds': '{seconds}秒',
    'duration.minutes': '{minutes}分钟 {seconds}秒',
    'duration.compactSeconds': '{seconds}s',
    'duration.compactMinutes': '{minutes}m {seconds}s',
  }
  return (copy[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name]))
}) as never

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ReasoningRow', () => {
  it('formats whole-second and minute durations', () => {
    expect(formatThinkingDuration(-1, thinkingT)).toBe('0秒')
    expect(formatThinkingDuration(8_999, thinkingT)).toBe('8秒')
    expect(formatThinkingDuration(68_900, thinkingT)).toBe('1分钟 8秒')
    expect(formatCompactThinkingDuration(8_999, thinkingT)).toBe('8s')
    expect(formatCompactThinkingDuration(68_900, thinkingT)).toBe('1m 8s')
  })

  it('keeps live reasoning visible and refuses collapse clicks', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)

    render(
      <ReasoningRow
        text="private reasoning"
        live
        active
        timing={{ startedAt: 8_000, endedAt: null }}
        t={t}
        thinkingT={thinkingT}
        codeLabels={{ copyLabel: '复制', copiedLabel: '已复制' }}
      />,
    )

    const button = screen.getByRole('button', { name: '已处理 2s' })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('private reasoning')).toBeTruthy()
    fireEvent.click(button)
    expect(screen.getByText('private reasoning')).toBeTruthy()

    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByRole('button', { name: '已处理 3s' })).toBeTruthy()
  })

  it('keeps lifecycle copy when live timing has not arrived yet', () => {
    render(
      <ReasoningRow
        text="early reasoning"
        live
        active
        t={t}
        thinkingT={thinkingT}
        codeLabels={{ copyLabel: '复制', copiedLabel: '已复制' }}
      />,
    )

    expect(screen.getByRole('button', { name: '已处理 0s' })).toBeTruthy()
    expect(screen.getByText('early reasoning')).toBeTruthy()
  })

  it('auto-collapses after live output ends without leaking a preview', () => {
    const { rerender } = render(
      <ReasoningRow
        text="never show this in the header"
        live
        active
        timing={{ startedAt: 1_000, endedAt: null }}
        t={t}
        thinkingT={thinkingT}
        codeLabels={{ copyLabel: '复制', copiedLabel: '已复制' }}
      />,
    )

    rerender(
      <ReasoningRow
        text="never show this in the header"
        live={false}
        active={false}
        timing={{ startedAt: 1_000, endedAt: 13_500 }}
        t={t}
        thinkingT={thinkingT}
        codeLabels={{ copyLabel: '复制', copiedLabel: '已复制' }}
      />,
    )

    const button = screen.getByRole('button', { name: '耗时 12秒' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('never show this in the header')).toBeNull()
    fireEvent.click(button)
    expect(screen.getByText('never show this in the header')).toBeTruthy()
    expect(screen.getByRole('button', { name: '耗时 12秒' })).toBeTruthy()
  })

  it('omits fabricated duration when timing is unavailable', () => {
    render(
      <ReasoningRow
        text="historical reasoning"
        live={false}
        active={false}
        t={t}
        thinkingT={thinkingT}
        codeLabels={{ copyLabel: '复制', copiedLabel: '已复制' }}
      />,
    )

    expect(screen.getByRole('button', { name: '思考过程' })).toBeTruthy()
    expect(screen.queryByText('historical reasoning')).toBeNull()
  })
})
