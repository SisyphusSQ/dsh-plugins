/**
 * Restores viewport coordinates for overlays that DSH positions from
 * `getBoundingClientRect()`.
 *
 * A rect is reported in the *rendered* space, so it already carries the zoom
 * factor. DSH's popup code writes such a value straight into the inline
 * `left`/`bottom` of a `position: fixed` box, and the browser then multiplies the
 * offset by the factor a second time — so a popover anchored near the window
 * bottom drifts further from its trigger as the factor grows.
 *
 * Only inline-styled offsets are touched. Anything positioned from a stylesheet
 * carries no inline value and is left alone, which keeps this corrector off the
 * ordinary layout path entirely.
 */
import { rescaleFixedOffset } from '../zoom.js'

/** Inline offset properties a positioning script may write. */
const OFFSET_PROPERTIES = ['left', 'top', 'right', 'bottom'] as const

/** Records the values this module wrote, so its own writes are not corrected twice. */
const WRITTEN = 'data-ui-zoom-offsets'

/** The signature of an element carrying no inline offset at all. */
const EMPTY_OFFSETS = 'left:;top:;right:;bottom:'

/** A disposable corrector. */
export interface FixedOffsetCorrection {
  /** Stop observing and drop every bookkeeping attribute. */
  dispose(): void
}

/**
 * Read the four inline offsets as one comparable string.
 * @param style - The element's inline style declaration.
 * @returns A stable signature of the current inline offsets.
 */
function offsetSignature(style: CSSStyleDeclaration): string {
  return OFFSET_PROPERTIES.map((property) => `${property}:${style.getPropertyValue(property)}`).join(';')
}

/**
 * Divide an element's inline offsets by the factor, once per external write.
 * @param element - Candidate overlay.
 * @param factor - The active zoom factor.
 */
function correctElement(element: HTMLElement, factor: number): void {
  if (factor === 1) return
  const style = element.style
  const signature = offsetSignature(style)
  // Cheap rejection: a stylesheet-positioned box has no inline offset at all.
  if (signature === EMPTY_OFFSETS) return
  // Skip our own previous write; a fresh external write differs from it.
  if (element.getAttribute(WRITTEN) === signature) return
  if (style.position !== '' && style.position !== 'fixed') return
  if (typeof element.ownerDocument.defaultView?.getComputedStyle === 'function') {
    const computed = element.ownerDocument.defaultView.getComputedStyle(element).position
    if (computed !== 'fixed') return
  }
  let changed = false
  for (const property of OFFSET_PROPERTIES) {
    const text = style.getPropertyValue(property)
    if (text === '') continue
    const value = Number.parseFloat(text)
    if (!Number.isFinite(value)) continue
    const next = rescaleFixedOffset(value, factor)
    if (next === value) continue
    style.setProperty(property, `${next}px`)
    changed = true
  }
  if (changed) element.setAttribute(WRITTEN, offsetSignature(style))
}

/**
 * Watch the document for script-positioned overlays and rescale their offsets.
 *
 * The correction is idempotent per external write: each pass records the values
 * it wrote, so the mutation it causes is recognised and skipped, while a later
 * write from the positioning script still differs and is corrected again.
 * @param doc - Document to observe.
 * @param factor - Reads the zoom factor currently in force.
 * @returns A disposable corrector.
 */
export function installFixedOffsetCorrection(
  doc: Document,
  factor: () => number,
): FixedOffsetCorrection {
  const observer = new MutationObserver((records) => {
    const active = factor()
    if (active === 1) return
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof HTMLElement) {
        correctElement(record.target, active)
        continue
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        correctElement(node, active)
        for (const nested of node.querySelectorAll<HTMLElement>('[style]')) {
          correctElement(nested, active)
        }
      }
    }
  })
  observer.observe(doc.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style'],
  })
  return {
    dispose: () => {
      observer.disconnect()
      for (const marked of doc.querySelectorAll(`[${WRITTEN}]`)) marked.removeAttribute(WRITTEN)
    },
  }
}
