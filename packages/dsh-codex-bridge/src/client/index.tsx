import type { Context } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { BridgeOptions, CatalogView } from '../types.js'
import { TYPERT_REMOTE } from '../remote.js'
import { en, zh, type CopyKey } from './locales.js'
import { createPageStore } from './store.js'
import { Page, type PageInjected } from './Page.js'
import { createCommit } from './commit.js'

export const name = 'dsh-codex-bridge'
export const inject = ['slots', 'locale', 'remote', 'configForms']
const namespace = 'suqingsq-codex-bridge'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'suqingsq-codex-bridge': CopyKey }
}

/** Register the settings page; native ConfigForms owns durable writes and conflicts. */
export async function apply(ctx: Context): Promise<void> {
  await ctx.remote.$mount(TYPERT_REMOTE)
  const form = ctx.configForms.get<BridgeOptions>(namespace)
  const store = createPageStore()
  let bound: BoundActions<typeof store> | undefined
  let closed = false
  let reading = false
  let initialRead = false
  let lastCatalog: CatalogView | undefined
  const t = ctx.locale.bind(namespace)
  ctx.effect(() => ctx.locale.register(namespace, { en, zh }))
  const editor = createCommit(form, field => window.confirm(t(field === 'connectMcp' ? 'confirmMcp' : 'confirmHooks')), (pending, error) => bound?.write(pending, error))
  ctx.effect(() => () => { closed = true; bound = undefined; editor.close() })
  ctx.effect(() => form.subscribe(() => { lastCatalog = undefined; bound?.catalog(undefined); bound?.config(form.getSnapshot()) }))
  const refresh = async () => {
    if (closed || reading) return
    reading = true
    const before = form.getSnapshot()
    try {
      const result = await ctx.remote.suqingsqCodexBridge.catalog()
      if (!closed) { lastCatalog = result.ok && before === form.getSnapshot() ? result.value : undefined; bound?.catalog(lastCatalog) }
    } catch { if (!closed) { lastCatalog = undefined; bound?.catalog(undefined) } }
    finally { reading = false }
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: namespace, label: 'Codex Home', order: 55,
    store, locale: namespace,
    inject: (actions: BoundActions<typeof store>): PageInjected => {
      bound = actions
      actions.config(form.getSnapshot())
      actions.catalog(lastCatalog)
      if (!initialRead) { initialRead = true; void refresh() }
      return { commit: (field, value) => { void editor.commit(field, value) }, refresh: () => { void refresh() } }
    },
  }, Page))
}
