/**
 * Zoom policy tests: the pure arithmetic and the two CSS entry points.
 *
 * The DOM write itself (an inline `zoom` on the document element, adopted by the
 * slot store and torn down with `ctx.effect`) is exercised by the plugin
 * registration tests, not here — these tests pin the scaling policy without
 * jsdom.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ZOOM_PERCENT,
  ZOOM_PERCENT_MAX,
  ZOOM_PERCENT_MIN,
  ZOOM_PERCENT_STEP,
} from '../src/settings.js'
import { bootZoomStyle, clampZoomPercent, stepZoomPercent, zoomCssValue } from '../src/zoom.js'

describe('clampZoomPercent', () => {
  it('passes through in-range values', () => {
    expect(clampZoomPercent(100)).toBe(100)
    expect(clampZoomPercent(125)).toBe(125)
  })

  it('clamps to the accepted range', () => {
    expect(clampZoomPercent(1)).toBe(ZOOM_PERCENT_MIN)
    expect(clampZoomPercent(10_000)).toBe(ZOOM_PERCENT_MAX)
    expect(clampZoomPercent(ZOOM_PERCENT_MIN - 1)).toBe(ZOOM_PERCENT_MIN)
    expect(clampZoomPercent(ZOOM_PERCENT_MAX + 1)).toBe(ZOOM_PERCENT_MAX)
  })

  it('rounds fractional input to whole percent', () => {
    expect(clampZoomPercent(120.4)).toBe(120)
    expect(clampZoomPercent(120.6)).toBe(121)
  })

  it('rejects non-finite input instead of silently clamping it', () => {
    expect(() => clampZoomPercent(Number.NaN)).toThrow(TypeError)
    expect(() => clampZoomPercent(Number.POSITIVE_INFINITY)).toThrow(TypeError)
  })
})

describe('stepZoomPercent', () => {
  it('moves one step in each direction', () => {
    expect(stepZoomPercent(100, 1)).toBe(100 + ZOOM_PERCENT_STEP)
    expect(stepZoomPercent(100, -1)).toBe(100 - ZOOM_PERCENT_STEP)
  })

  it('stops at the range edges', () => {
    expect(stepZoomPercent(ZOOM_PERCENT_MIN, -1)).toBe(ZOOM_PERCENT_MIN)
    expect(stepZoomPercent(ZOOM_PERCENT_MAX, 1)).toBe(ZOOM_PERCENT_MAX)
  })

  it('steps relative to a value that sits off the step grid', () => {
    // A hand-edited deployment value must still move the way the user asked.
    expect(stepZoomPercent(103, 1)).toBe(108)
    expect(stepZoomPercent(103, -1)).toBe(98)
  })
})

describe('zoomCssValue', () => {
  it('converts percent to the CSS multiplier', () => {
    expect(zoomCssValue(100)).toBe('1')
    expect(zoomCssValue(125)).toBe('1.25')
    expect(zoomCssValue(50)).toBe('0.5')
    expect(zoomCssValue(300)).toBe('3')
  })

  it('clamps before converting', () => {
    expect(zoomCssValue(9_999)).toBe('3')
  })
})

describe('bootZoomStyle', () => {
  it('targets the document element, never the application root', () => {
    // Menus, modals and toasts portal onto document.body, so a rule scoped to
    // #root would leave every overlay unscaled.
    expect(bootZoomStyle(DEFAULT_ZOOM_PERCENT)).toBe(':root{zoom:1}')
  })

  it('carries the configured value', () => {
    expect(bootZoomStyle(150).startsWith(':root{zoom:1.5}')).toBe(true)
  })

  it('cannot emit an out-of-range rule', () => {
    expect(bootZoomStyle(1_000).startsWith(':root{zoom:3}')).toBe(true)
  })
})
