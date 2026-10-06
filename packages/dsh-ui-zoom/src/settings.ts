/**
 * Durable whole-interface zoom settings shared by the Host schema and the browser scope.
 *
 * This module is deliberately dependency-free: the browser half imports the
 * constants and the settings type from here, so pulling a schema builder in
 * would drag `@deepseek-ai/schemastery` into the client bundle. The schema
 * itself lives in the Host half, which is the only side that validates it.
 */

/** Settings namespace owned by this plugin. */
export const UI_ZOOM_NAMESPACE = 'ui-zoom'

/** Field carrying the whole-interface zoom percentage. */
export const ZOOM_FIELD = 'zoomPercent'

/** Smallest accepted zoom (percent). */
export const ZOOM_PERCENT_MIN = 50

/** Largest accepted zoom (percent). */
export const ZOOM_PERCENT_MAX = 300

/** Step between accepted zoom values (percent). */
export const ZOOM_PERCENT_STEP = 5

/** Zoom used when the user-settings document carries no override (percent). */
export const DEFAULT_ZOOM_PERCENT = 100

/**
 * Durable zoom preference.
 *
 * Percent keeps the whole pipeline on integers: the schema step, the settings
 * row stepper, and the shortcut deltas never accumulate float error, and the
 * CSS value is derived once at the DOM boundary.
 */
export interface UiZoomSettings {
  /** Whole-interface zoom in percent, within {@link ZOOM_PERCENT_MIN}..{@link ZOOM_PERCENT_MAX}. */
  zoomPercent: number
}
