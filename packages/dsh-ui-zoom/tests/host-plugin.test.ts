/**
 * Host-half registration: the settings binding and the pre-plugin stylesheet.
 *
 * The browser half cannot remove the first-paint flash on its own — it runs
 * after the shell has painted. These tests pin the contract that makes the
 * Host do it: the settings scope binding, and one `style` row carrying the
 * configured zoom on the index-injection table.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, bootZoomStyle, Config, name } from '../src/index.js'
import { UI_ZOOM_NAMESPACE, ZOOM_FIELD } from '../src/settings.js'

/** One row pushed onto the index-injection table. */
interface InjectionRow {
  readonly kind: string
  readonly text?: string
}

/** The injected child context the Host plugin registers its settings scope on. */
interface HostChild {
  effect: (install: () => unknown) => unknown
  settings: { configure: (...args: unknown[]) => unknown }
}

/** Build a fake host context capturing the index-inject hook it registers. */
function createHostHarness(zoomPercent: number) {
  const hooks: { event: string; handler: (table: InjectionRow[]) => void; options?: unknown }[] = []
  const configure = vi.fn()
  const child: HostChild = { effect: (install: () => unknown) => install(), settings: { configure } }
  const inject = vi.fn((_services: string[], run: (child: HostChild) => void) => run(child))
  const ctx = {
    inject,
    on: (event: string, handler: (table: InjectionRow[]) => void, options?: unknown) => {
      hooks.push({ event, handler, options })
      return vi.fn()
    },
    fiber: {},
  } as unknown as Context
  const config = { zoomPercent: { get: () => zoomPercent } }
  return { ctx, config, hooks, inject, configure }
}

describe('ui-zoom host plugin', () => {
  it('identifies the package', () => {
    expect(name).toBe('dsh-ui-zoom')
  })

  it('binds the zoom field to the Host settings document', () => {
    const { ctx, config, inject, configure } = createHostHarness(100)
    apply(ctx, config as never)
    expect(inject).toHaveBeenCalledWith(['settings'], expect.any(Function))
    expect(configure).toHaveBeenCalled()
    expect(UI_ZOOM_NAMESPACE).toBe('ui-zoom')
    expect(ZOOM_FIELD).toBe('zoomPercent')
  })

  it('injects the zoom stylesheet before other index rows', () => {
    const { ctx, config, hooks } = createHostHarness(150)
    apply(ctx, config as never)

    const hook = hooks.find(entry => entry.event === 'webserver/index-inject')
    expect(hook).toBeDefined()
    // `prepend: true` is what puts the zoom ahead of the other injected rows.
    expect(hook?.options).toEqual({ prepend: true })

    const table: InjectionRow[] = []
    hook?.handler(table)
    expect(table).toHaveLength(1)
    expect(table[0]?.kind).toBe('style')
    expect(table[0]?.text?.startsWith(':root{zoom:1.5}')).toBe(true)
  })

  it('carries the deployment default into the injected stylesheet', () => {
    const { ctx, config, hooks } = createHostHarness(125)
    apply(ctx, config as never)
    const table: InjectionRow[] = []
    hooks[0]?.handler(table)
    expect(table[0]?.text).toBe(bootZoomStyle(125))
  })

  it('clamps an out-of-range deployment default instead of emitting it', () => {
    const { ctx, config, hooks } = createHostHarness(10_000)
    apply(ctx, config as never)
    const table: InjectionRow[] = []
    hooks[0]?.handler(table)
    expect(table[0]?.text?.startsWith(':root{zoom:3}')).toBe(true)
  })

  it('declares a live schema field defaulting to 100', () => {
    // `.volatile()` is what makes the field a reactive getter rather than a
    // plain value — the shape the Host reads through `config.zoomPercent.get()`.
    const resolved = new Config({}) as unknown as { zoomPercent: { get: () => number } }
    expect(typeof resolved.zoomPercent.get).toBe('function')
    expect(resolved.zoomPercent.get()).toBe(100)
  })
})
