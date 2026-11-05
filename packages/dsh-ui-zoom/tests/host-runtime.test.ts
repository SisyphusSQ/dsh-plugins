/** Real Cordis/Settings runtime; configuration directory and Loader are in-memory boundaries. */
import { Context } from '@deepseek-ai/cordis'
import SettingsForms from '@deepseek-ai/dsh-settings'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it } from 'vitest'
import * as zoom from '../src/index.js'

/** No profile is opened or written: Settings only checks the absent legacy file below /dev/null. */
async function runtime(config: { zoomPercent?: number }) {
  const root = new Context()
  root.provide('loader', { await: async () => {} } as never)
  root.provide('profileContext', { home: '/dev/null' } as never)
  let fiber: ReturnType<Context['plugin']> | undefined
  const entry = { id: 'zoom-test', options: { id: 'ui-zoom', config }, get fiber() { return fiber } }
  root.provide('configEditor', {
    configuration: () => [{ entry, inherited: {}, override: entry.options.config }],
  } as never)
  const settings = root.plugin(SettingsForms)
  await settings.await()
  fiber = root.plugin(zoom, config)
  await fiber.await()
  return { root, fiber, settings: settings.ctx.settings, entry }
}

function injectedStyle(root: Context): string | undefined {
  const table: IndexInjection[] = []
  // The zoom listener does not read peer identity; no Peer is admitted by this fixture.
  root.emit('webserver/index-inject', table, {} as never)
  return table.find(row => row.kind === 'style')?.text
}

describe('Cordis 4.1 raw/effective zoom configuration', () => {
  it('describes a schema default without converting raw config into a live object', async () => {
    const { root, fiber, settings } = await runtime({})
    try {
      expect(fiber.config).toEqual({})
      expect(fiber.rawConfig).toEqual({})
      expect((fiber.effectiveConfig as zoom.Config).zoomPercent.get()).toBe(100)
      expect(settings.describe()).toEqual([expect.objectContaining({
        ns: 'ui-zoom', autoGenerate: false, value: { zoomPercent: 100 }, base: { zoomPercent: 100 },
      })])
      expect(injectedStyle(root)).toBe(zoom.bootZoomStyle(100))
    } finally {
      await root.fiber.dispose()
    }
  })

  it('applies updated configuration and describes the effective value, not raw config', async () => {
    const { root, fiber, settings, entry } = await runtime({ zoomPercent: 125 })
    try {
      expect(fiber.config).toEqual({ zoomPercent: 125 })
      expect(settings.describe()[0]?.value).toEqual({ zoomPercent: 125 })
      entry.options.config = { zoomPercent: 150 }
      await fiber.update(entry.options.config)
      await fiber.await()
      expect(fiber.config).toEqual({ zoomPercent: 150 })
      expect((fiber.effectiveConfig as zoom.Config).zoomPercent.get()).toBe(150)
      expect(settings.describe()[0]).toEqual(expect.objectContaining({
        autoGenerate: false, value: { zoomPercent: 150 }, user: { zoomPercent: 150 },
      }))
      expect(injectedStyle(root)).toBe(zoom.bootZoomStyle(150))
    } finally {
      await root.fiber.dispose()
    }
  })

  it('removes settings policy and index injection with the owning fiber, then remounts cleanly', async () => {
    const { root, fiber, settings } = await runtime({ zoomPercent: 125 })
    try {
      expect(settings.describe()[0]?.autoGenerate).toBe(false)
      await fiber.dispose()
      expect(settings.describe()).toEqual([])
      expect(injectedStyle(root)).toBeUndefined()
      // A leaked configure policy would make a repeated registration on this owner throw.
      const release = settings.configure({ auto: false }, fiber)
      release()
      const again = root.plugin(zoom, { zoomPercent: 150 })
      await again.await()
      expect(injectedStyle(root)).toBe(zoom.bootZoomStyle(150))
      await again.dispose()
      expect(injectedStyle(root)).toBeUndefined()
    } finally {
      await root.fiber.dispose()
    }
  })
})
