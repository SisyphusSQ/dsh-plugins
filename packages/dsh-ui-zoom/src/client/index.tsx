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
import { bootZoomStyle, clampZoomPercent, zoomCssValue, zoomFactor } from '../zoom.js'
import { en, zh, type UiZoomKey } from './locales.js'
import { installFixedOffsetCorrection } from './fixed-offsets.js'
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
  let current = host.getSnapshot().value?.zoomPercent ?? DEFAULT_ZOOM_PERCENT

  const publish = (percent: number): void => {
    current = clampZoomPercent(percent)
    document.documentElement.style.zoom = zoomCssValue(current)
    if (compensation !== undefined) compensation.textContent = bootZoomStyle(current)
    revision += 1
    bound?.sync(current, revision)
  }

  // Adopt the durable value without writing it back; the write path is commit().
  const adopt = (): void => {
    const section = host.getSnapshot().value
    if (section === undefined || section.zoomPercent === current) return
    publish(section.zoomPercent)
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
    return () => { document.documentElement.style.removeProperty('zoom') }
  }, 'dsh-ui-zoom: document zoom')

  // The Host injects the boot rules, but they bake the factor in and go stale the
  // moment the user moves the row, so this element is their live owner.
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.dshUiZoom = ''
    style.textContent = bootZoomStyle(current)
    document.head.append(style)
    compensation = style
    return () => {
      style.remove()
      compensation = undefined
    }
  }, 'dsh-ui-zoom: compensation stylesheet')

  // Overlays DSH positions from a rect land one factor too far, for the same
  // reason the viewport units overflow; put their offsets back.
  ctx.effect(
    () => installFixedOffsetCorrection(document, () => zoomFactor(current)).dispose,
    'dsh-ui-zoom: fixed-offset correction',
  )

  ctx.effect(
    () => ctx.locale.register(UI_ZOOM_NS, { zh, en }),
    'dsh-ui-zoom: dictionaries',
  )

  /** Persist and apply a new zoom; the settings echo adopts it back through adopt(). */
  const commit = (percent: number): void => {
    const next = clampZoomPercent(percent)
    if (next === current) return
    publish(next)
    void host.set(ZOOM_FIELD, next)
  }

  const injected = (actions: BoundActions<typeof store>): UiZoomRowInjected => {
    bound = actions
    // Re-sync from the live value so no change is lost between registration
    // and first render; the store's revision guard drops stale duplicates.
    bound.sync(current, revision)
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
