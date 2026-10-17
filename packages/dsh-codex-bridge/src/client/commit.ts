import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { BridgeOptions } from '../types.js'
import type { EditableField } from './store.js'

/** Persist one field without optimistic adoption; native forms own revision recovery. */
export function createCommit(host: ConfigForm<BridgeOptions>, confirm: (field: 'connectMcp' | 'executeHooks') => boolean, publish: (pending: boolean, error?: 'refused' | 'failed') => void) {
  let busy = false
  let closed = false
  return {
    async commit(field: EditableField, value: string | boolean): Promise<void> {
      const snapshot = host.getSnapshot()
      if (closed || busy || snapshot.status !== 'ready' || !snapshot.writable) return
      if (snapshot.value?.[field] === value) return
      if ((field === 'connectMcp' || field === 'executeHooks') && value === true && !confirm(field)) return
      busy = true
      publish(true)
      try {
        const accepted = await host.set(field, value)
        if (!closed) publish(false, accepted ? undefined : 'refused')
      } catch { if (!closed) publish(false, 'failed') }
      finally { busy = false }
    },
    close() { closed = true },
  }
}
