import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { RemoteAccessService } from '@deepseek-ai/dsh-api-remote-access'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import { isRemoteJsonValue, remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { DiagnosticsService } from '../lib/diagnostics.js'
import { TYPERT_REMOTE } from '../lib/remote.js'

test('real rc.2 Gateway discovers sanitized diagnostics and unload removes its service', async () => {
  const ctx = new Context()
  const registryFiber = ctx.plugin(TypertRegistry)
  await registryFiber
  // DSH 0.2.1's Gateway requires the separate remote-access service.
  const accessFiber = ctx.plugin(RemoteAccessService)
  await accessFiber
  const gatewayFiber = ctx.plugin(TypertGatewayService, {})
  await gatewayFiber
  // DSH 0.2.1 requires an admitted Peer on every Gateway invocation.
  const peer = new Peer(ctx, { principal: { kind: 'owner' } })
  let service
  const fiber = ctx.plugin({ name: 'fixture-diagnostics', apply(child) {
    service = new DiagnosticsService(child, { catalog: async () => ({ home: '/fixture', scannedAt: '2026-10-06', skills: [], plugins: [], agents: [], hooks: [], diagnostics: [], mcp: [{ id: 'server', enabled: true, config: { env: { PRIVATE_MARKER: 'secret' }, command: 'PRIVATE_COMMAND' } }] }) })
  } })
  try {
    await fiber
    assert.deepEqual(remoteMethods(service).map(row => row.method), ['catalog'])
    const view = await ctx.typertGateway.invoke({ peer, namespace: 'suqingsqCodexBridge', method: 'catalog', args: {} })
    assert.ok(isRemoteJsonValue(view))
    assert.deepEqual(view.mcp, [{ id: 'server', enabled: true }])
    assert.ok(!JSON.stringify(view).includes('PRIVATE_'))
    assert.deepEqual(TYPERT_REMOTE.descriptors[0].parameters, [])
    await fiber.dispose()
    await assert.rejects(() => ctx.typertGateway.invoke({ peer, namespace: 'suqingsqCodexBridge', method: 'catalog', args: {} }))
  } finally {
    await fiber.dispose()
    await peer.dispose()
    await gatewayFiber.dispose()
    await accessFiber.dispose()
    await registryFiber.dispose()
  }
})
