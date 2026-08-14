import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronRightOutline14: () => <span data-testid="chevron-right" />,
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

import { formatThinkingDuration, ReasoningRow } from '../src/client/ReasoningRow.js'

const t = ((key: string) => key) as never
const thinkingT = ((key: string, params?: Record<string, unknown>) => {
  const copy: Record<string, string> = {
    'status.running': '思考中',
    'status.history': '思考过程',
    'status.elapsed': '耗时 {duration}',
    'duration.seconds': '{seconds}秒',
    'duration.minutes': '{minutes}分钟 {seconds}秒',
  }
  return (copy[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name]))
}) as never

afterEach(cleanup)

describe('ReasoningRow', () => {
  it('formats whole-second and minute durations', () => {
    expect(formatThinkingDuration(-1, thinkingT)).toBe('0秒')
    expect(formatThinkingDuration(8_999, thinkingT)).toBe('8秒')
    expect(formatThinkingDuration(68_900, thinkingT)).toBe('1分钟 8秒')
  })

  it('keeps live reasoning visible and refuses collapse clicks', () => {
    render(
      <ReasoningRow
        text="private reasoning"
        live
        active
        timing={{ startedAt: Date.now() - 2_000, endedAt: null }}
        t={t}
        thinkingT={thinkingT}
      />,
    )

    const button = screen.getByRole('button', { name: '思考中' })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('private reasoning')).toBeTruthy()
    fireEvent.click(button)
    expect(screen.getByText('private reasoning')).toBeTruthy()
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
      />,
    )

    const button = screen.getByRole('button', { name: '耗时 12秒' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('never show this in the header')).toBeNull()
    fireEvent.click(button)
    expect(screen.getByText('never show this in the header')).toBeTruthy()
  })

  it('omits fabricated duration when timing is unavailable', () => {
    render(
      <ReasoningRow
        text="historical reasoning"
        live={false}
        active={false}
        t={t}
        thinkingT={thinkingT}
      />,
    )

    expect(screen.getByRole('button', { name: '思考过程' })).toBeTruthy()
    expect(screen.queryByText('historical reasoning')).toBeNull()
  })
})
