/**
 * Host registration for the durable whole-interface zoom preference.
 *
 * The Host half owns two things the browser half cannot do for itself:
 * the settings-document binding (so the value survives reloads per profile and
 * is editable from the settings page) and the pre-plugin stylesheet (so the
 * first paint is already zoomed instead of flashing an unzoomed shell).
 */
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_ZOOM_PERCENT,
  ZOOM_PERCENT_MAX,
  ZOOM_PERCENT_MIN,
  ZOOM_PERCENT_STEP,
} from './settings.js'
import { bootZoomStyle } from './zoom.js'

export {
  DEFAULT_ZOOM_PERCENT, UI_ZOOM_NAMESPACE, ZOOM_FIELD,
  ZOOM_PERCENT_MAX, ZOOM_PERCENT_MIN, ZOOM_PERCENT_STEP,
  type UiZoomSettings,
} from './settings.js'
export { bootZoomStyle, clampZoomPercent, stepZoomPercent, zoomCssValue } from './zoom.js'

/** Package name, used as the Loader row's module name. */
export const name = 'dsh-ui-zoom'

/** Runtime zoom preference projected to the browser. */
export interface Config {
  /** Whole-interface zoom in percent. */
  zoomPercent: Volatile<number>
}

/** Live zoom preference, bound to the Host user-settings document. */
export const Config = z.object({
  zoomPercent: z.number()
    .step(ZOOM_PERCENT_STEP)
    .min(ZOOM_PERCENT_MIN)
    .max(ZOOM_PERCENT_MAX)
    .default(DEFAULT_ZOOM_PERCENT)
    .volatile(),
})

/**
 * Supply the current zoom before browser plugins start.
 * @param ctx - Host plugin context.
 * @param config - Validated live zoom preference.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'style', text: bootZoomStyle(config.zoomPercent.get()) })
  }, { prepend: true })
}
