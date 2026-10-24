/** Client registration and the complete zoom stylesheet lifecycle. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { UI_ZOOM_NAMESPACE, ZOOM_FIELD } from '../src/settings.js'
import { bootZoomStyle } from '../src/zoom.js'
import { apply, inject, name, UI_ZOOM_NS } from '../src/client/index.js'
import type { UiZoomRowInjected } from '../src/client/UiZoomRow.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose()
  document.head.replaceChildren()
  document.body.replaceChildren()
  document.documentElement.style.removeProperty('zoom')
})

/** Model settings notifications and effect disposal, not browser layout. */
function createHarness(options: { zoomPercent?: number } = {}) {
  const registrations: Record<string, unknown>[] = []
  const listeners = new Set<() => void>()
  const subscribe = vi.fn((listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  })
  const set = vi.fn(async () => undefined)
  const snapshot = { value: { zoomPercent: options.zoomPercent ?? 100 } }
  const context = {
    slots: {
      inject: (_name: string, install: () => void) => install(),
      register: (descriptor: Record<string, unknown>) => {
        registrations.push(descriptor)
        return vi.fn()
      },
    },
    locale: {
      register: vi.fn(() => vi.fn()),
      bind: vi.fn(() => (key: string) => key),
    },
    configForms: {
      get: vi.fn(() => ({ getSnapshot: () => snapshot, subscribe, set })),
    },
    effect: vi.fn((install: () => unknown) => {
      const dispose = install()
      if (typeof dispose === 'function') disposers.push(dispose as () => void)
      return dispose
    }),
    remote: { $on: vi.fn(() => vi.fn()) },
    on: vi.fn(() => vi.fn()),
  }
  return {
    ctx: context as unknown as ClientContext,
    registrations,
    subscribe,
    set,
    adopt: (percent: number) => {
      snapshot.value.zoomPercent = percent
      for (const listener of listeners) listener()
    },
  }
}

function addBootStyle(percent: number): HTMLStyleElement {
  const style = document.createElement('style')
  style.textContent = bootZoomStyle(percent)
  document.head.append(style)
  return style
}

/** Read actual CSSOM declarations, including any forgotten boot stylesheet. */
function bodyHeightDeclarations(): string[] {
  return [...document.styleSheets].flatMap(sheet => [...sheet.cssRules])
    .filter((rule): rule is CSSStyleRule => 'selectorText' in rule && rule.selectorText === 'body')
    .map(rule => rule.style.height)
    .filter(Boolean)
}

describe('ui-zoom client plugin', () => {
  it('declares the services it uses', () => {
    expect(name).toBe('dsh-ui-zoom')
    expect(inject).toEqual(['slots', 'locale', 'remote', 'configForms'])
  })

  it('applies the durable zoom and releases its styles on unload', () => {
    const boot = addBootStyle(125)
    const { ctx } = createHarness({ zoomPercent: 125 })
    apply(ctx)
    expect(document.documentElement.style.zoom).toBe('1.25')
    for (const dispose of disposers.splice(0).reverse()) dispose()
    expect(document.documentElement.style.zoom).toBe('')
    expect(boot.isConnected).toBe(false)
    expect(document.querySelector('style[data-dsh-ui-zoom]')).toBeNull()
    expect(bodyHeightDeclarations()).toEqual([])
  })

  it('takes ownership of the boot sheet instead of leaving a second stale sheet', () => {
    const unrelated = document.createElement('style')
    unrelated.textContent = 'body{color:red}'
    document.head.append(unrelated)
    const boot = addBootStyle(150)
    const { ctx } = createHarness({ zoomPercent: 115 })
    apply(ctx)
    expect(document.querySelector('style[data-dsh-ui-zoom]')).toBe(boot)
    expect(bodyHeightDeclarations()).toEqual(['calc(86.9565vh)'])
    expect(unrelated.isConnected).toBe(true)
  })

  it('keeps live compensation after host stylesheets loaded after the boot sheet', () => {
    addBootStyle(150)
    const hostStyles = document.createElement('style')
    // Same specificity as the host's body branch, without jsdom's grouped-
    // selector specificity limitation (the #root branch must not rank body).
    hostStyles.textContent = 'body{height:100%;margin:0}'
    document.head.append(hostStyles)
    const { ctx } = createHarness({ zoomPercent: 115 })
    apply(ctx)
    expect(Number.parseFloat(getComputedStyle(document.body).height)).toBeCloseTo(window.innerHeight / 1.15, 2)
    expect(hostStyles.isConnected).toBe(true)
  })

  it('removes boot compensation when an external settings update resets to 100%', () => {
    addBootStyle(150)
    const { ctx, adopt, set } = createHarness({ zoomPercent: 150 })
    apply(ctx)
    adopt(100)
    expect(document.documentElement.style.zoom).toBe('1')
    expect(bodyHeightDeclarations()).toEqual([])
    expect(set).not.toHaveBeenCalled()
    adopt(115)
    expect(bodyHeightDeclarations()).toEqual(['calc(86.9565vh)'])
    adopt(100)
    expect(bodyHeightDeclarations()).toEqual([])
  })

  it('clears boot compensation when the settings row resets to 100%', () => {
    addBootStyle(150)
    const { ctx, registrations } = createHarness({ zoomPercent: 150 })
    apply(ctx)
    const row = registrations.find(entry => entry.id === 'ui-zoom')!
    const injectRow = row.inject as (actions: { sync: ReturnType<typeof vi.fn> }) => UiZoomRowInjected
    injectRow({ sync: vi.fn() }).setZoomPercent(100)
    expect(document.documentElement.style.zoom).toBe('1')
    expect(bodyHeightDeclarations()).toEqual([])
  })

  it('creates and releases a sheet when no Host sheet exists', () => {
    const { ctx } = createHarness({ zoomPercent: 115 })
    apply(ctx)
    expect(document.querySelectorAll('style[data-dsh-ui-zoom]')).toHaveLength(1)
    expect(bodyHeightDeclarations()).toEqual(['calc(86.9565vh)'])
    for (const dispose of disposers.splice(0).reverse()) dispose()
    expect(document.querySelectorAll('style[data-dsh-ui-zoom]')).toHaveLength(0)
  })

  it('can reactivate after disposal without orphaned boot or live rules', () => {
    addBootStyle(115)
    const harness = createHarness({ zoomPercent: 115 })
    apply(harness.ctx)
    for (const dispose of disposers.splice(0).reverse()) dispose()
    apply(harness.ctx)
    expect(document.querySelectorAll('style[data-dsh-ui-zoom]')).toHaveLength(1)
    harness.adopt(150)
    expect(document.documentElement.style.zoom).toBe('1.5')
    expect(bodyHeightDeclarations()).toEqual(['calc(66.6667vh)'])
    for (const dispose of disposers.splice(0).reverse()) dispose()
    expect(bodyHeightDeclarations()).toEqual([])
    expect(document.querySelector('style[data-dsh-ui-zoom]')).toBeNull()
  })

  it('registers the settings row in the General section', () => {
    const { ctx, registrations } = createHarness()
    apply(ctx)
    const row = registrations.find(entry => entry.name === 'settings.general.item')
    expect(row).toBeDefined()
    expect(row?.id).toBe('ui-zoom')
    expect(row?.locale).toBe(UI_ZOOM_NS)
    expect(typeof row?.order).toBe('number')
    expect(row?.store).toBeDefined()
    expect(typeof row?.inject).toBe('function')
  })

  it('adopts the durable preference without writing it back', () => {
    const { ctx, subscribe, set } = createHarness({ zoomPercent: 150 })
    apply(ctx)
    expect(subscribe).toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    expect(document.documentElement.style.zoom).toBe('1.5')
  })

  it('exposes the settings namespace the schema owns', () => {
    expect(UI_ZOOM_NAMESPACE).toBe('ui-zoom')
    expect(ZOOM_FIELD).toBe('zoomPercent')
  })
})
