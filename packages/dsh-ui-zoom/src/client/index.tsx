/**
 * Browser half of the whole-interface zoom feature.
 *
 * Owns two things: the live zoom write on the document element, and the
 * General-settings row. The durable value lives in the Host user-settings
 * document, reached through `ctx.configForms`; the Host half also injects the
 * stylesheet that applies the zoom before this bundle runs, so the row never
 * has to fix a first-paint flash.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the ctx.configForms Context merge is the only settings channel used.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import {
  DEFAULT_ZOOM_PERCENT,
  UI_ZOOM_NAMESPACE,
  ZOOM_FIELD,
  type UiZoomSettings,
} from '../settings.js'
import { bootZoomStyle, clampZoomPercent, zoomCssValue, zoomFactor, ZOOM_STYLE_MARKER } from '../zoom.js'
import { en, zh, type UiZoomKey } from './locales.js'
import { installFixedOffsetCorrection, type FixedOffsetCorrection } from './fixed-offsets.js'
import { createUiZoomRowStore } from './settings-store.js'
import { UiZoomRow, type UiZoomRowInjected } from './UiZoomRow.js'

export type { UiZoomRowComponentProps, UiZoomRowInjected } from './UiZoomRow.js'
export type { UiZoomRowState } from './settings-store.js'
export type { UiZoomKey } from './locales.js'
export type { UiZoomSettings } from '../settings.js'

/** Client module name; keeps the browser half identifiable in the boot graph. */
export const name = 'dsh-ui-zoom'

/** Namespace owning this feature's settings-row copy and shortcut labels. */
export const UI_ZOOM_NS = 'ui-zoom'

/** Settings-row id inside the General section. */
const ZOOM_ROW_ID = 'ui-zoom'

/** Sort key placing the row after the built-in Appearance (10) and font size (11) rows. */
const ZOOM_ROW_ORDER = 12

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The zoom settings row's copy and the zoom shortcut labels. */
    'ui-zoom': UiZoomKey
  }
}

/**
 * Required services: slots/locale for the settings row, configForms for the
 * durable preference, remote for the forwarded settings invalidation that
 * `configForms` subscribes to.
 */
export const inject = ['slots', 'locale', 'remote', 'configForms']

/**
 * Client plugin body: apply the zoom and register the feature-owned settings row.
 * @param ctx - Client cordis context.
 */
export function apply(ctx: ClientContext): void {
  const host: ConfigForm<UiZoomSettings> = ctx.configForms.get<UiZoomSettings>(UI_ZOOM_NAMESPACE)
  const store = createUiZoomRowStore()
  let bound: BoundActions<typeof store> | undefined
  let revision = 0
  let compensation: HTMLStyleElement | undefined
  let fixedCorrection: FixedOffsetCorrection | undefined
  let current = host.getSnapshot().value?.zoomPercent ?? DEFAULT_ZOOM_PERCENT
  let confirmed = current
  let pendingWrite = 0
  let writeGeneration = 0
  let disposed = false
  let saveFailed = false

  const publish = (percent: number, failed = false): void => {
    current = clampZoomPercent(percent)
    saveFailed = failed
    document.documentElement.style.zoom = zoomCssValue(current)
    if (compensation !== undefined) compensation.textContent = bootZoomStyle(current)
    fixedCorrection?.refresh()
    revision += 1
    bound?.sync(current, revision, saveFailed)
  }

  // Describe invalidations can expose an earlier write while ConfigForm still
  // queues newer ones. Remember that Host fact, but keep the latest local intent
  // live until its own write settles; idle external changes still adopt normally.
  const adopt = (): void => {
    const section = host.getSnapshot().value
    if (disposed || section === undefined) return
    confirmed = clampZoomPercent(section.zoomPercent)
    if (pendingWrite !== 0 || confirmed === current) return
    publish(confirmed)
  }

  ctx.effect(
    () => host.subscribe(() => { adopt() }),
    'dsh-ui-zoom: settings scope adoption',
  )

  // The Host already injected `:root{zoom:…}` before this bundle ran; the
  // inline property repeats it so a runtime change has a live owner, and the
  // disposer retracts both when the plugin unloads.
  ctx.effect(() => {
    document.documentElement.style.zoom = zoomCssValue(current)
    return () => {
      disposed = true
      bound = undefined
      document.documentElement.style.removeProperty('zoom')
    }
  }, 'dsh-ui-zoom: document zoom')

  // Take over the Host's first-paint sheet rather than layering a second sheet
  // above it. At 100% there are no compensation rules, so a forgotten boot sheet
  // would become active again. The same owner removes all rules on unload.
  ctx.effect(() => {
    const style = [...document.head.querySelectorAll('style')]
      .find(sheet => sheet.textContent?.includes(ZOOM_STYLE_MARKER))
      ?? document.createElement('style')
    style.dataset.dshUiZoom = ''
    style.textContent = bootZoomStyle(current)
    // Move an adopted early boot sheet after the shell's own stylesheet too.
    document.head.append(style)
    compensation = style
    return () => {
      style.remove()
      compensation = undefined
    }
  }, 'dsh-ui-zoom: compensation stylesheet')

  // Overlays DSH positions from a rect land one factor too far, for the same
  // reason the viewport units overflow; put their offsets back.
  ctx.effect(() => {
    const correction = installFixedOffsetCorrection(document, () => zoomFactor(current))
    fixedCorrection = correction
    return () => {
      fixedCorrection = undefined
      correction.dispose()
    }
  }, 'dsh-ui-zoom: fixed-offset correction')

  ctx.effect(
    () => ctx.locale.register(UI_ZOOM_NS, { zh, en }),
    'dsh-ui-zoom: dictionaries',
  )

  const settled = (generation: number, accepted: boolean): void => {
    if (disposed || generation !== pendingWrite) return
    pendingWrite = 0
    const section = host.getSnapshot().value
    if (section !== undefined) confirmed = clampZoomPercent(section.zoomPercent)
    publish(accepted ? section?.zoomPercent ?? current : confirmed, !accepted)
  }

  /** Persist each choice without letting an earlier Host echo erase later clicks. */
  const commit = (percent: number): void => {
    const next = clampZoomPercent(percent)
    if (disposed || (next === current && !saveFailed)) return
    const generation = ++writeGeneration
    pendingWrite = generation
    publish(next)
    void host.set(ZOOM_FIELD, next).then(
      accepted => { settled(generation, accepted) },
      () => { settled(generation, false) },
    )
  }

  const injected = (actions: BoundActions<typeof store>): UiZoomRowInjected => {
    bound = actions
    // Re-sync from the live value so no change is lost between registration
    // and first render; the store's revision guard drops stale duplicates.
    bound.sync(current, revision, saveFailed)
    return { setZoomPercent: (percent) => { commit(percent) } }
  }

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: ZOOM_ROW_ID,
    order: ZOOM_ROW_ORDER,
    store,
    locale: UI_ZOOM_NS,
    inject: injected,
  }, UiZoomRow))
}
