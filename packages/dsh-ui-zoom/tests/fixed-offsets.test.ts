/**
 * The fixed-offset corrector. A rect is reported in the rendered space, so a
 * popup positioner that writes one into an inline offset lands a factor too far;
 * these tests pin the correction and, just as importantly, its restraint.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { installFixedOffsetCorrection } from '../src/client/fixed-offsets.js'

/** Let the MutationObserver deliver its batch. */
const settle = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.innerHTML = ''
})

/** Add a fixed-position popup and let the observer see its style write. */
async function place(factor: number, css: string): Promise<HTMLElement> {
  dispose = installFixedOffsetCorrection(document, () => factor).dispose
  const element = document.createElement('div')
  element.style.position = 'fixed'
  document.body.append(element)
  await settle()
  element.setAttribute('style', `position:fixed;${css}`)
  await settle()
  return element
}

describe('installFixedOffsetCorrection', () => {
  it('divides a rect-derived left and bottom by the factor', async () => {
    const element = await place(1.25, 'left:100px;bottom:200px')
    expect(Number.parseFloat(element.style.left)).toBeCloseTo(80)
    expect(Number.parseFloat(element.style.bottom)).toBeCloseTo(160)
  })

  it('leaves offsets alone at 100%', async () => {
    const element = await place(1, 'left:100px;bottom:200px')
    expect(element.style.left).toBe('100px')
    expect(element.style.bottom).toBe('200px')
  })

  it('does not touch a box that is not fixed-positioned', async () => {
    dispose = installFixedOffsetCorrection(document, () => 1.25).dispose
    const element = document.createElement('div')
    element.setAttribute('style', 'position:absolute;left:100px;bottom:200px')
    document.body.append(element)
    await settle()
    expect(element.style.left).toBe('100px')
  })

  it('ignores a stylesheet-positioned box, which carries no inline offset', async () => {
    dispose = installFixedOffsetCorrection(document, () => 1.25).dispose
    const element = document.createElement('div')
    element.className = 'popover'
    document.body.append(element)
    await settle()
    expect(element.getAttribute('style')).toBeNull()
  })

  it('corrects a later write instead of dividing its own result twice', async () => {
    const element = await place(1.25, 'left:100px;bottom:200px')
    expect(Number.parseFloat(element.style.left)).toBeCloseTo(80)
    // 80 / 1.25 would be 64 if the observer re-corrected its own write.
    expect(Number.parseFloat(element.style.left)).not.toBeCloseTo(64)
    // A fresh write from the positioner is corrected again, from the new value.
    element.setAttribute('style', 'position:fixed;left:200px;bottom:200px')
    await settle()
    expect(Number.parseFloat(element.style.left)).toBeCloseTo(160)
  })

  it('drops its bookkeeping attribute on dispose', async () => {
    const element = await place(1.25, 'left:100px;bottom:200px')
    expect(element.hasAttribute('data-ui-zoom-offsets')).toBe(true)
    dispose?.()
    dispose = undefined
    expect(element.hasAttribute('data-ui-zoom-offsets')).toBe(false)
  })
})
