/**
 * Registration contract for the browser half: the three keyboard commands, the
 * General-settings row, and the document-level zoom write.
 *
 * The fake context mirrors only what `apply` touches, so the test fails loudly
 * if the plugin starts reaching for a wider surface.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { UI_ZOOM_NAMESPACE, ZOOM_FIELD } from '../src/settings.js'
import { apply, inject, name, UI_ZOOM_NS } from '../src/client/index.js'

/** Build a fake client context and expose the spies the assertions need. */
function createHarness(options: { zoomPercent?: number } = {}) {
  const registrations: Record<string, unknown>[] = []
  const subscribe = vi.fn(() => vi.fn())
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
    shortcuts: { register: vi.fn(() => vi.fn()) },
    configForms: {
      get: vi.fn(() => ({ getSnapshot: () => snapshot, subscribe, set })),
    },
    effect: vi.fn((install: () => unknown) => install()),
    remote: { $on: vi.fn(() => vi.fn()) },
    on: vi.fn(() => vi.fn()),
  }
  return {
    ctx: context as unknown as ClientContext,
    context,
    registrations,
    subscribe,
    set,
  }
}

describe('ui-zoom client plugin', () => {
  it('declares the services it uses', () => {
    expect(name).toBe('dsh-ui-zoom')
    expect(inject).toEqual(['slots', 'locale', 'remote', 'configForms'])
  })

  it('applies the durable zoom on load and retracts it on unload', () => {
    const { ctx } = createHarness({ zoomPercent: 125 })
    apply(ctx)
    expect(document.documentElement.style.zoom).toBe('1.25')
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
    // Loading the stored value is a read; only a user action writes.
    expect(subscribe).toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    expect(document.documentElement.style.zoom).toBe('1.5')
  })

  it('exposes the settings namespace the schema owns', () => {
    expect(UI_ZOOM_NAMESPACE).toBe('ui-zoom')
    expect(ZOOM_FIELD).toBe('zoomPercent')
  })
})
