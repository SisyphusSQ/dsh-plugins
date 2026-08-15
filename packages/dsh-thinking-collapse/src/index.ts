import type { Context } from '@deepseek-ai/cordis'

/** Stable Cordis loader entry id from cordis.patch.yml. */
export const name = 'dsh-thinking-collapse'

/**
 * Host entry required for profile composition. All product behavior lives in
 * the browser client half discovered from this loader entry.
 */
export function apply(ctx: Context): void {
  void ctx
}
