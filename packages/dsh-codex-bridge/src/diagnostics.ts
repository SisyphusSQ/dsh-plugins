import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { HomeRuntime } from './runtime.js'
import { catalogView, type CatalogView } from './types.js'
import { compileHook } from './hooks.js'

/** Feature-owned allowlisted diagnostic export through the trusted Host carrier. */
export class DiagnosticsService extends TypertRemoteService {
  constructor(ctx: Context, private readonly runtime: HomeRuntime) { super(ctx, 'suqingsqCodexBridge') }
  /** Read metadata without authorizing or launching any imported program.
   * @returns A fresh lossless-JSON projection, never prompt/env/header/command data.
   */
  @Remote
  async catalog(): Promise<CatalogView> {
    const catalog = await this.runtime.catalog()
    const view = catalogView(catalog)
    // Never mutate the shared catalog or echo parser/command details into diagnostics.
    view.diagnostics = [...view.diagnostics]
    for (const hook of catalog.hooks) {
      try { compileHook(hook) } catch {
        view.diagnostics.push({ severity: 'warning', code: 'HOOK_UNSUPPORTED', source: hook.source, message: 'Hook event, matcher or execution configuration is unsupported; it will not run.' })
      }
    }
    return JSON.parse(JSON.stringify(view)) as CatalogView
  }
}
