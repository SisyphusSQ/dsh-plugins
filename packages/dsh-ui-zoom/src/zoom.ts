/**
 * Pure zoom arithmetic shared by the settings row and the DOM writer — and by
 * the Host half, which needs {@link bootZoomStyle} before any browser plugin
 * exists. No DOM and no framework: every function here is a
 * total function of its arguments, so the whole scaling policy is
 * unit-testable without jsdom.
 */
import {
  ZOOM_PERCENT_MAX,
  ZOOM_PERCENT_MIN,
  ZOOM_PERCENT_STEP,
} from './settings.js'

/** Step direction accepted by {@link stepZoomPercent}. */
export type ZoomDirection = 1 | -1

/**
 * Clamp a requested zoom into the accepted range.
 * @param percent - Requested zoom in percent; must be finite.
 * @returns The nearest accepted integer percent.
 * @throws TypeError when `percent` is not a finite number.
 */
export function clampZoomPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    throw new TypeError(`zoom percent must be a finite number, received ${String(percent)}`)
  }
  return Math.min(ZOOM_PERCENT_MAX, Math.max(ZOOM_PERCENT_MIN, Math.round(percent)))
}

/**
 * Move one step from the current zoom and clamp the result.
 *
 * Stepping is relative to the value actually in force, not to a fixed ladder,
 * so a hand-edited deployment value (which may sit off the step grid) still
 * moves in the direction the user asked for.
 * @param current - Zoom in force, in percent.
 * @param direction - `1` to zoom in, `-1` to zoom out.
 * @param step - Step size in percent; defaults to {@link ZOOM_PERCENT_STEP}.
 * @returns The clamped next zoom in percent.
 */
export function stepZoomPercent(
  current: number,
  direction: ZoomDirection,
  step: number = ZOOM_PERCENT_STEP,
): number {
  return clampZoomPercent(current + direction * step)
}

/**
 * Convert a percent into the CSS `zoom` value written on the document element.
 * @param percent - Zoom in percent.
 * @returns The CSS value, e.g. `1.25` for 125.
 */
export function zoomCssValue(percent: number): string {
  return String(clampZoomPercent(percent) / 100)
}

/**
 * Convert a percent into the numeric factor used by the compensating rules.
 * @param percent - Zoom in percent.
 * @returns The factor, e.g. `1.25` for 125.
 */
export function zoomFactor(percent: number): number {
  return clampZoomPercent(percent) / 100
}

/**
 * Build the stylesheet that keeps viewport-relative boxes filling the window.
 *
 * CSS `zoom` multiplies *absolute* lengths, and viewport units are absolute:
 * inside a subtree zoomed by `z`, a `100vh` box is laid out at the viewport
 * height and then rendered `z` times taller, so the shell overflows by
 * `(z - 1) x viewport` and every bottom-anchored control — the account launcher
 * and the popover above it, for instance — is pushed past the window edge.
 * Dividing the shell's own box by the factor cancels the multiplication, and the
 * cap catches descendants that size themselves with a viewport unit directly.
 *
 * The factor is baked into the numbers rather than read from a custom property,
 * so the Host can inject this before any browser plugin runs and the first paint
 * is already correct.
 *
 * Chromium scales the CSS pixel itself for *page* zoom, which has none of these
 * problems, but DSH exposes no page-zoom API (no `zoomFactor`, no zoom menu
 * role), so `zoom` is the only mechanism available to a plugin.
 * @param percent - Zoom in percent.
 * @returns The compensating rules, or an empty string at 100%.
 */
export function zoomCompensationCss(percent: number): string {
  const factor = zoomFactor(percent)
  if (factor === 1) return ''
  return [
    `body{width:calc(100vw / ${factor});height:calc(100vh / ${factor})}`,
    `body>*{max-height:calc(100vh / ${factor})}`,
  ].join('')
}

/**
 * Rescale an offset that a script computed from `getBoundingClientRect()`.
 *
 * Rect coordinates are reported in the *rendered* space, so they already carry
 * the zoom factor. Writing one into an inline `left`/`top`/`bottom`/`right` of a
 * `position: fixed` box multiplies it by the factor a second time, which is why
 * a bottom-anchored popup drifts away from its trigger as the factor grows.
 * Dividing by the factor restores the intended viewport coordinate exactly.
 * @param value - The inline offset as written by the positioning script.
 * @param factor - The active zoom factor.
 * @returns The value to write instead.
 */
export function rescaleFixedOffset(value: number, factor: number): number {
  if (!Number.isFinite(value) || factor === 0 || factor === 1) return value
  return value / factor
}

/**
 * Build the stylesheet the Host injects before any browser plugin runs.
 *
 * The document element is the only correct target: menus, modals, hover cards,
 * toasts and the lightbox all mount through `createPortal` onto `document.body`,
 * so zooming the application root alone would leave every overlay unscaled.
 * The injected rules also remove the first-paint flash of an unzoomed shell and
 * carry the viewport compensation, so the first paint is already correct.
 * @param percent - Zoom in percent.
 * @returns A stylesheet.
 */
export function bootZoomStyle(percent: number): string {
  return `:root{zoom:${zoomCssValue(percent)}}${zoomCompensationCss(percent)}`
}
