import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconThinkOutline14: () => <span data-testid="think-icon" />,
  DisclosureRow: ({
    icon,
    title,
    open,
    onToggle,
    collapsedContent,
    children,
  }: {
    icon: ReactNode
    title: string
    open: boolean
    onToggle: () => void
    collapsedContent?: ReactNode
    children: ReactNode
  }) => (
    <section>
      <button type="button" aria-expanded={open} onClick={onToggle}>
        {icon}
        {title}
      </button>
      {!open && collapsedContent}
      {open && <div>{children}</div>}
    </section>
  ),
}))

import { ThinkRow } from '../src/client/ThinkRow.js'

const t = ((key: string) => key) as never

afterEach(() => {
  cleanup()
})

describe('ThinkRow', () => {
  it('shows the first line while collapsed and keeps the rest in the body', () => {
    render(
      <ThinkRow
        text={'first line\nsecond line'}
        running={false}
        t={t}
      />,
    )

    const button = screen.getByRole('button', { name: /Think/ })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByTestId('think-icon')).toBeTruthy()
    expect(screen.getByText('first line')).toBeTruthy()
    expect(screen.queryByText('second line')).toBeNull()
    expect(document.querySelector('[data-activity="thought"]')?.getAttribute('data-state')).toBe('ok')

    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/second line/)).toBeTruthy()
  })

  it('previews the latest line while streaming without forcing the row open', () => {
    render(
      <ThinkRow
        text={'first line\nlatest line'}
        running
        t={t}
      />,
    )

    const button = screen.getByRole('button', { name: /Think/ })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('[data-activity="thought"]')?.getAttribute('data-state')).toBe('running')
    expect(screen.queryByText('first line')).toBeNull()
    expect(screen.getByText('latest line')).toBeTruthy()
  })
})
