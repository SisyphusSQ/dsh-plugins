/** Rescale script-owned viewport pixel coordinates without changing CSS-relative lengths. */
import { rescaleFixedOffset } from '../zoom.js'

const OFFSET_PROPERTIES = ['left', 'top', 'right', 'bottom'] as const
// DSH 0.2.2's anchored hook writes these limits from visualViewport in rendered pixels.
const ANCHORED_LIMITS = ['--dsh-anchored-max-width', '--dsh-anchored-max-height'] as const
const WRITTEN = 'data-ui-zoom-offsets'
const PIXELS = /^-?(?:\d+\.?\d*|\.\d+)px$/

interface Correction {
  source: string
  written: string
  priority: string
}

/** A disposable corrector which also follows live zoom changes. */
export interface FixedOffsetCorrection {
  /** Reapply mounted overlays from their latest source coordinates. */
  refresh(): void
  /** Stop observing and restore values still owned by the corrector. */
  dispose(): void
}

/**
 * Observe fixed overlays. Track each property independently: a Host update of
 * `top` must not divide an already corrected `left` again. Relative CSS values
 * are not viewport pixels and stay untouched. Only anchored panels have their
 * hook-owned min-width corrected; ordinary design minimums remain unchanged.
 * @param doc - Document to observe.
 * @param factor - Reads the active document zoom.
 * @returns A corrector owned by the calling plugin's lifecycle.
 */
export function installFixedOffsetCorrection(doc: Document, factor: () => number): FixedOffsetCorrection {
  const tracked = new Map<HTMLElement, Map<string, Correction>>()
  let disposed = false

  const restore = (element: HTMLElement, properties: Map<string, Correction>): void => {
    for (const [property, previous] of properties) {
      // A newer external write wins, including writes not yet delivered by the observer.
      if (element.style.getPropertyValue(property) === previous.written
        && element.style.getPropertyPriority(property) === previous.priority) {
        element.style.setProperty(property, previous.source, previous.priority)
      }
    }
    element.removeAttribute(WRITTEN)
    tracked.delete(element)
  }

  const correct = (element: HTMLElement): void => {
    const style = element.style
    const previous = tracked.get(element)
    const active = factor()
    if (active === 1) {
      if (previous !== undefined) restore(element, previous)
      return
    }
    const anchored = ANCHORED_LIMITS.some(property => style.getPropertyValue(property) !== '')
    if (previous === undefined && !anchored && OFFSET_PROPERTIES.every(property => style.getPropertyValue(property) === '')) return
    const fixed = (style.position === '' || style.position === 'fixed')
      && doc.defaultView?.getComputedStyle(element).position === 'fixed'
    if (!fixed) {
      if (previous !== undefined) restore(element, previous)
      return
    }
    const properties = previous ?? new Map<string, Correction>()
    const candidates: readonly string[] = [...OFFSET_PROPERTIES, ...ANCHORED_LIMITS, ...anchored ? ['min-width'] : []]
    for (const property of candidates) {
      const text = style.getPropertyValue(property)
      const priority = style.getPropertyPriority(property)
      const entry = properties.get(property)
      const source = entry !== undefined && text === entry.written && priority === entry.priority ? entry.source : text
      if (!PIXELS.test(source.trim())) {
        properties.delete(property)
        continue
      }
      const next = `${rescaleFixedOffset(Number.parseFloat(source), active)}px`
      if (text !== next) style.setProperty(property, next, priority)
      properties.set(property, { source, written: style.getPropertyValue(property), priority })
    }
    if (properties.size > 0) {
      tracked.set(element, properties)
      element.setAttribute(WRITTEN, '')
    } else {
      tracked.delete(element)
      element.removeAttribute(WRITTEN)
    }
  }

  const refresh = (): void => {
    if (disposed) return
    for (const element of doc.body.querySelectorAll<HTMLElement>('[style]')) correct(element)
    for (const [element, properties] of tracked) {
      if (!doc.body.contains(element)) restore(element, properties)
    }
  }

  const observer = new MutationObserver(records => {
    if (disposed) return
    const candidates = new Set<HTMLElement>()
    let removed = false
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof HTMLElement) candidates.add(record.target)
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        candidates.add(node)
        for (const nested of node.querySelectorAll<HTMLElement>('[style]')) candidates.add(nested)
      }
      removed ||= record.removedNodes.length > 0
    }
    for (const element of candidates) correct(element)
    if (removed) {
      for (const [element, properties] of tracked) {
        if (!doc.body.contains(element)) restore(element, properties)
      }
    }
  })
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] })
  refresh()
  return {
    refresh,
    dispose: () => {
      disposed = true
      observer.disconnect()
      for (const [element, properties] of tracked) restore(element, properties)
    },
  }
}
