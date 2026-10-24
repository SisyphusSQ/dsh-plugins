import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogView } from '../types.js'

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'failed'

/** Owns a read-only catalog request; configuration identity fences late results. */
export function createCatalogReader(
  read: () => Promise<RemoteResult<CatalogView>>,
  configuration: () => unknown,
  publish: (status: CatalogStatus, value: CatalogView | undefined) => void,
) {
  let closed = false
  let generation = 0
  let snapshot: { status: CatalogStatus; value: CatalogView | undefined } = { status: 'idle', value: undefined }
  let active: { generation: number; promise: Promise<void> } | undefined
  const update = (status: CatalogStatus, value?: CatalogView) => {
    snapshot = { status, value }
    publish(status, value)
  }
  return {
    getSnapshot: () => snapshot,
    invalidate() {
      if (closed) return
      generation++
      update('idle')
    },
    refresh(): Promise<void> {
      if (closed) return Promise.resolve()
      if (active?.generation === generation) return active.promise
      const started = generation
      const before = configuration()
      update('loading')
      const promise = (async () => {
        try {
          const result = await read()
          if (closed || started !== generation) return
          if (before !== configuration()) { update('idle'); return }
          if (result.ok) update('ready', result.value)
          else update('failed')
        } catch {
          if (!closed && started === generation) update(before === configuration() ? 'failed' : 'idle')
        }
      })()
      const request = { generation: started, promise }
      active = request
      void promise.finally(() => { if (active === request) active = undefined })
      return promise
    },
    close() { closed = true; generation++ },
  }
}
