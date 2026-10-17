import type { RemoteResult, TypertRemoteContribution, TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogView } from './types.js'

/** Narrow rc.2 SRC bridge: no input fields, only a sanitized JSON output.
 * Parameterized methods must use generated strict input codecs, not this pattern.
 */
export const TYPERT_REMOTE = {
  package: '@suqingsq/dsh-codex-bridge',
  descriptors: [{
    id: '@suqingsq/dsh-codex-bridge#suqingsqCodexBridge/catalog',
    service: 'suqingsqCodexBridge', namespace: 'suqingsqCodexBridge', method: 'catalog',
    invocation: { kind: 'direct' }, parameters: [], result: { mode: 'src-json' },
  }],
} satisfies TypertRemoteContribution

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap { 'suqingsqCodexBridge/catalog': () => Promise<RemoteResult<CatalogView>> }
  interface TypertRemoteNamespaceMap { suqingsqCodexBridge: TypertRemoteNamespace<'suqingsqCodexBridge'> }
}
