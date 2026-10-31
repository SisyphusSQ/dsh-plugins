/// <reference types="node" />
/** Real rc5 configuration form/mirror and zoom row store; only the wire is controlled. */
import { readFile } from 'node:fs/promises'
import { runInThisContext } from 'node:vm'
import * as cordis from '@deepseek-ai/cordis'
import * as clientStore from '@deepseek-ai/dsh-client-store'
import type { SettingsDescribeView } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import { Config } from '../src/index.js'
import { apply as applyZoom } from '../src/client/index.js'
import type { createUiZoomRowStore } from '../src/client/settings-store.js'
import type { UiZoomRowInjected } from '../src/client/UiZoomRow.js'
import { UI_ZOOM_NAMESPACE } from '../src/settings.js'

type NamespaceView = SettingsDescribeView['namespaces'][number]
type MutationResponse = { ok: true; value: NamespaceView } | { ok: false; error: { code: string; message: string } }

interface Write {
  percent: number
  resolve(response: MutationResponse): void
  reject(error: Error): void
}

interface RowDescriptor {
  id: string
  store: ReturnType<typeof createUiZoomRowStore>
  inject(actions: BoundActions<ReturnType<typeof createUiZoomRowStore>>): UiZoomRowInjected
}

async function settingsClient(): Promise<{ apply(ctx: cordis.Context): void }> {
  const source = await readFile(new URL(import.meta.resolve('@deepseek-ai/dsh-client-ui-settings/client')), 'utf8')
  let exports: { apply(ctx: cordis.Context): void } | undefined
  // Execute the published client factory, not a handwritten ConfigForm double.
  const load = runInThisContext(`(window) => { ${source}\n }`) as (window: unknown) => void
  load({ __ModuleLoader__: { load(entry: { factory(require: (id: string) => unknown): unknown }) {
    exports = entry.factory((id) => {
      if (id === '@deepseek-ai/cordis') return cordis
      if (id === '@deepseek-ai/dsh-client-store') return clientStore
      throw new Error(`unexpected settings client dependency: ${id}`)
    }) as typeof exports
  } } })
  if (exports === undefined) throw new Error('settings client factory did not register')
  return exports
}

export async function createSettingsRuntime(initial = 100) {
  const root = new cordis.Context()
  const listeners = new Set<() => void>()
  const writes: Write[] = []
  const requested: number[] = []
  let percent = initial
  let revision = 1
  let closing = false
  let row!: RowDescriptor

  const namespace = (): NamespaceView => ({
    ns: UI_ZOOM_NAMESPACE, autoGenerate: false, applies: 'live',
    schema: JSON.parse(JSON.stringify(Config)) as NamespaceView['schema'],
    value: { zoomPercent: percent }, base: { zoomPercent: 100 },
    user: { zoomPercent: percent }, secrets: [], revision,
  })
  const refusal = (): MutationResponse => ({ ok: false, error: { code: 'settings/rejected', message: 'Host refused zoom' } })
  const remote = {
    $on(_event: string, listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    settings: {
      async describe() { return { ok: true, value: { namespaces: [namespace()], writable: true, hasDocument: true } } },
      mutate(_namespace: string, ops: { op: string; path: string[]; value: number }[]) {
        if (closing) return Promise.resolve(refusal())
        const next = ops[0]!.value
        requested.push(next)
        return new Promise<MutationResponse>((resolve, reject) => { writes.push({ percent: next, resolve, reject }) })
      },
    },
  }
  const provider = root.extend({ remote })
  const settings = await settingsClient()
  settings.apply(provider)
  await provider.configForms.describe().ensure()
  const zoom = provider.plugin({
    name: 'zoom-runtime-test',
    apply(plugin) {
      applyZoom(plugin.extend({
        slots: {
          inject(_name: string, install: () => unknown) { return install() },
          register(descriptor: RowDescriptor) { row = descriptor; return () => {} },
        },
        locale: { register() { return () => {} } },
      }))
    },
  })
  await zoom.inertia
  const instance = row.store.create()
  const injected = row.inject(instance.actions)
  return {
    instance, injected, requested,
    unload: () => zoom.dispose(),
    async flush() { await provider.configForms.describe().ensure(); await Promise.resolve() },
    async notify(next: number) {
      percent = next
      revision += 1
      for (const listener of listeners) listener()
      await provider.configForms.describe().ensure()
    },
    async accept() {
      const write = writes.shift()
      if (write === undefined) throw new Error('no pending settings write')
      percent = write.percent
      revision += 1
      write.resolve({ ok: true, value: namespace() })
      await Promise.resolve()
    },
    async refuse() {
      const write = writes.shift()
      if (write === undefined) throw new Error('no pending settings write')
      write.resolve(refusal())
      await Promise.resolve()
    },
    async disconnect() {
      const write = writes.shift()
      if (write === undefined) throw new Error('no pending settings write')
      write.reject(new Error('settings transport disconnected'))
      await Promise.resolve()
    },
    pending: () => writes.length,
    async dispose() {
      closing = true
      for (const write of writes.splice(0)) write.resolve(refusal())
      await root.fiber.dispose()
    },
  }
}
