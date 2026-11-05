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

  it('rescales target anchored viewport caps and anchor-derived minimum width', async () => {
    const element = await place(1.5, 'left:120px;top:60px;--dsh-anchored-max-width:776px;--dsh-anchored-max-height:576px;min-width:240px')
    expect(Number.parseFloat(element.style.getPropertyValue('--dsh-anchored-max-height'))).toBeCloseTo(384)
    expect(Number.parseFloat(element.style.getPropertyValue('--dsh-anchored-max-width'))).toBeCloseTo(776 / 1.5)
    expect(element.style.minWidth).toBe('160px')
  })

  it('does not divide an untouched offset again when only the other offset changes', async () => {
    const element = await place(1.25, 'left:100px;top:200px')
    element.style.top = '300px'
    await settle()
    expect(element.style.left).toBe('80px')
    expect(element.style.top).toBe('240px')
  })

  it('preserves non-pixel offsets and unrelated minimum widths', async () => {
    const element = await place(1.5, 'left:25%;top:calc(100% - 40px);right:2em;min-width:120px')
    expect(element.style.left).toBe('25%')
    expect(element.style.top).toBe('calc(100% - 40px)')
    expect(element.style.right).toBe('2em')
    expect(element.style.minWidth).toBe('120px')
  })

  it('restores the latest source values and priorities on dispose', async () => {
    const element = await place(1.25, 'left:100px !important;top:200px')
    element.style.top = '300px'
    await settle()
    dispose?.()
    dispose = undefined
    expect(element.style.left).toBe('100px')
    expect(element.style.getPropertyPriority('left')).toBe('important')
    expect(element.style.top).toBe('300px')
  })

  it('does not overwrite a newer external value when disposing before observer delivery', async () => {
    const element = await place(1.25, 'left:100px;top:200px')
    element.style.left = '175px'
    dispose?.()
    dispose = undefined
    expect(element.style.left).toBe('175px')
    expect(element.style.top).toBe('200px')
  })

  it('reapplies existing overlays from source coordinates when the zoom changes', async () => {
    let factor = 1.5
    const correction = installFixedOffsetCorrection(document, () => factor)
    dispose = correction.dispose
    const element = document.createElement('div')
    element.setAttribute('style', 'position:fixed;left:150px;--dsh-anchored-max-height:576px')
    document.body.append(element)
    await settle()
    factor = 1
    correction.refresh()
    expect(element.style.left).toBe('150px')
    expect(element.style.getPropertyValue('--dsh-anchored-max-height')).toBe('576px')
    factor = 0.5
    correction.refresh()
    expect(element.style.left).toBe('300px')
    expect(element.style.getPropertyValue('--dsh-anchored-max-height')).toBe('1152px')
  })

  it('corrects an overlay already mounted when the plugin activates', async () => {
    const element = document.createElement('div')
    element.setAttribute('style', 'position:fixed;left:150px;--dsh-anchored-max-height:576px')
    document.body.append(element)
    dispose = installFixedOffsetCorrection(document, () => 1.5).dispose
    expect(element.style.left).toBe('100px')
    expect(element.style.getPropertyValue('--dsh-anchored-max-height')).toBe('384px')
  })

  it('drops its bookkeeping attribute on dispose', async () => {
    const element = await place(1.25, 'left:100px;bottom:200px')
    expect(element.hasAttribute('data-ui-zoom-offsets')).toBe(true)
    dispose?.()
    dispose = undefined
    expect(element.hasAttribute('data-ui-zoom-offsets')).toBe(false)
  })
})
