/**
 * Settings-row rendering: the surface the user actually edits.
 *
 * The registration test proves the row is contributed with the right
 * descriptor; this one proves the component renders the persisted value and
 * drives the write path with whole-percent steps, which is what the Settings
 * page shows and clicks.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZOOM_PERCENT_MAX, ZOOM_PERCENT_MIN, ZOOM_PERCENT_STEP } from '../src/settings.js'
import { UiZoomRow, type UiZoomRowComponentProps } from '../src/client/UiZoomRow.js'

afterEach(cleanup)

/** Render the row with a fixed store value and a spy write path. */
function renderRow(zoomPercent: number) {
  const setZoomPercent = vi.fn()
  const useStore = ((selector: (state: { zoomPercent: number; revision: number }) => unknown) =>
    selector({ zoomPercent, revision: 1 })) as unknown as UiZoomRowComponentProps['useStore']
  const props = {
    // The row renders the value and the unit label from two separate keys.
    t: (key: string) => (key === 'zoom.unit' ? '%' : key),
    setZoomPercent,
    useStore,
  } as unknown as UiZoomRowComponentProps
  render(<UiZoomRow {...props} />)
  return { setZoomPercent }
}

describe('UiZoomRow', () => {
  it('shows the persisted percentage, not a click echo', () => {
    renderRow(125)
    expect(screen.getByText('125%')).toBeDefined()
  })

  it('steps up and down by the configured percent step', () => {
    const up = renderRow(100)
    fireEvent.click(screen.getByLabelText('zoom.increase'))
    expect(up.setZoomPercent).toHaveBeenCalledWith(100 + ZOOM_PERCENT_STEP)
    cleanup()

    const down = renderRow(100)
    fireEvent.click(screen.getByLabelText('zoom.decrease'))
    expect(down.setZoomPercent).toHaveBeenCalledWith(100 - ZOOM_PERCENT_STEP)
  })

  it('resets to 100%', () => {
    const { setZoomPercent } = renderRow(175)
    fireEvent.click(screen.getByText('zoom.reset'))
    expect(setZoomPercent).toHaveBeenCalledWith(100)
  })

  it('disables the steppers at the range edges', () => {
    renderRow(ZOOM_PERCENT_MIN)
    expect((screen.getByLabelText('zoom.decrease') as HTMLButtonElement).disabled).toBe(true)
    cleanup()

    renderRow(ZOOM_PERCENT_MAX)
    expect((screen.getByLabelText('zoom.increase') as HTMLButtonElement).disabled).toBe(true)
  })
})
