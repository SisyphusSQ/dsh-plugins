import type { Context } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { BridgeOptions } from '../types.js'
import { TYPERT_REMOTE } from '../remote.js'
import { en, zh, type CopyKey } from './locales.js'
import { createPageStore } from './store.js'
import { Page, type PageInjected } from './Page.js'
import { createCommit } from './commit.js'
import { createCatalogReader } from './catalog-reader.js'

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
  let initialRead = false
  const reader = createCatalogReader(
    () => ctx.remote.suqingsqCodexBridge.catalog(),
    () => form.getSnapshot(),
    (status, value) => bound?.catalog(status, value),
  )
  const t = ctx.locale.bind(namespace)
  ctx.effect(() => ctx.locale.register(namespace, { en, zh }))
  const editor = createCommit(form, field => window.confirm(t(field === 'connectMcp' ? 'confirmMcp' : 'confirmHooks')), (pending, error) => bound?.write(pending, error))
  const readInitially = () => {
    if (bound && !initialRead && form.getSnapshot().status === 'ready') {
      initialRead = true
      void reader.refresh()
    }
  }
  ctx.effect(() => () => { bound = undefined; editor.close(); reader.close() })
  ctx.effect(() => form.subscribe(() => { reader.invalidate(); bound?.config(form.getSnapshot()); readInitially() }))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: namespace, label: 'Codex Home', order: 55,
    store, locale: namespace,
    inject: (actions: BoundActions<typeof store>): PageInjected => {
      bound = actions
      actions.config(form.getSnapshot())
      const catalog = reader.getSnapshot()
      actions.catalog(catalog.status, catalog.value)
      readInitially()
      return { commit: (field, value) => { void editor.commit(field, value) }, refresh: () => { void reader.refresh() } }
    },
  }, Page))
}
