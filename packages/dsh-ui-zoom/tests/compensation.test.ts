/**
 * The viewport compensation: `zoom` multiplies absolute lengths, so a `100vh`
 * shell renders `factor x` too tall and pushes bottom-anchored UI off screen.
 * These tests pin the exact rules that cancel it.
 */
import { describe, expect, it } from 'vitest'
import {
  bootZoomStyle,
  rescaleFixedOffset,
  zoomCompensationCss,
  zoomFactor,
} from '../src/zoom.js'

describe('zoomFactor', () => {
  it('converts percent to the factor the CSS divides by', () => {
    expect(zoomFactor(100)).toBe(1)
    expect(zoomFactor(115)).toBeCloseTo(1.15)
    expect(zoomFactor(150)).toBeCloseTo(1.5)
  })

  it('clamps out-of-range input the same way the row does', () => {
    expect(zoomFactor(10)).toBeCloseTo(0.5)
    expect(zoomFactor(999)).toBeCloseTo(3)
  })
})

describe('zoomCompensationCss', () => {
  it('emits nothing at 100%, so an untouched profile pays no rules', () => {
    expect(zoomCompensationCss(100)).toBe('')
  })

  it('sizes the shell to the viewport divided by the factor', () => {
    const css = zoomCompensationCss(125)
    expect(css).toContain('body{width:calc(100vw / 1.25);height:calc(100vh / 1.25)}')
  })

  it('caps descendants that size themselves with a viewport unit directly', () => {
    expect(zoomCompensationCss(125)).toContain('body>*{max-height:calc(100vh / 1.25)}')
  })

  it('bakes the factor into the numbers so the Host can inject it first', () => {
    // No custom property, no attribute gate: the boot sheet must work before any
    // browser plugin has run.
    const css = zoomCompensationCss(115)
    expect(css).not.toContain('var(')
    expect(css).toContain('1.15')
  })
})

describe('bootZoomStyle', () => {
  it('carries the zoom and its compensation together', () => {
    const css = bootZoomStyle(125)
    expect(css.startsWith(':root{zoom:1.25}')).toBe(true)
    expect(css).toContain('calc(100vh / 1.25)')
  })

  it('stays a single zoom rule at 100%', () => {
    expect(bootZoomStyle(100)).toBe(':root{zoom:1}')
  })
})

describe('rescaleFixedOffset', () => {
  it('divides a rect-derived offset by the factor', () => {
    // A popover 100 rendered px from the left must ask for 80 so the browser's
    // second multiplication lands it back on 100.
    expect(rescaleFixedOffset(100, 1.25)).toBe(80)
  })

  it('is the identity at 100% and for non-finite input', () => {
    expect(rescaleFixedOffset(37, 1)).toBe(37)
    expect(rescaleFixedOffset(Number.NaN, 1.25)).toBeNaN()
    expect(rescaleFixedOffset(12, 0)).toBe(12)
  })
})
