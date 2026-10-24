import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { BridgeOptions, CatalogView } from '../types.js'
import type { CatalogStatus } from './catalog-reader.js'
export type SwitchField = 'enabled' | 'instructions' | 'skills' | 'plugins' | 'agents' | 'connectMcp' | 'executeHooks'
export type EditableField = SwitchField | 'home'
export interface PageState {
  config: ConfigFormSnapshot<BridgeOptions>
  pending: boolean
  error: 'refused' | 'failed' | undefined
  catalogStatus: CatalogStatus
  catalog: CatalogView | undefined
}
type PageActions = {
  config: (draft: PageState, value: ConfigFormSnapshot<BridgeOptions>) => void
  write: (draft: PageState, pending: boolean, error: PageState['error']) => void
  catalog: (draft: PageState, status: CatalogStatus, value: CatalogView | undefined) => void
}
export function createPageStore() {
  return defineStore<PageState, PageActions>({
    init: () => ({ config: { status: 'loading', value: undefined, base: undefined, user: undefined, revision: undefined, writable: false }, pending: false, error: undefined, catalogStatus: 'idle', catalog: undefined }),
    actions: {
      config: (draft, value) => { draft.config = value },
      write: (draft, pending, error) => { draft.pending = pending; draft.error = error },
      catalog: (draft, status, value) => { draft.catalogStatus = status; draft.catalog = value },
    },
  })
}
