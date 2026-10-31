import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** Native reference dependencies are declared in this package's dsh.client.inject. */
export const inject: string[] = []

/**
 * Keep the published client entry compatible without registering a second `@`
 * source. DSH's ui-reference entry owns candidates, reference chips, serialization,
 * and clipboard behavior; its native session-reference resolver prepares context.
 */
export function apply(_ctx: ClientContext): void {}
