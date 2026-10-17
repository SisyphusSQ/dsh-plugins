import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import { SubagentRuntime } from '@deepseek-ai/dsh-subagent'

// This deliberately tests the public native seams WITHOUT manufacturing an
// Agent factory or a spawn provider. It is a prerequisites regression, not a
// successful delegation composition or a real-model end-to-end test.
test('native Agent/Subagent seams alone cannot execute imported roles', { timeout: 10000 }, async () => {
  const ctx = new Context()
  const fibers = []
  try {
    // DSH 0.2.1 made the working-directory service a hard prerequisite of the
    // SubagentRuntime fiber. Provide only that seam; the test still manufactures
    // no Agent factory and no spawn provider.
    const workingDirectory = ctx.plugin({ name: 'fixture-working-directory', apply(child) {
      child.provide('workingDirectory', { ensure: async () => process.cwd() })
    } })
    fibers.push(workingDirectory)
    await workingDirectory.await()
    const agents = ctx.plugin(AgentRegistry)
    fibers.push(agents)
    await agents.await()
    const subagents = ctx.plugin(SubagentRuntime, {})
    fibers.push(subagents)
    await subagents.await()
    assert.deepEqual(ctx.subagents.list(), [])
    assert.equal(ctx.subagents.getProvider('spawn'), undefined)
    await assert.rejects(ctx.agents.create({ sessionId: 'readonly-codex-prerequisite-probe' }), /no agent factory registered/)
    // NO_PROVIDER must happen before request validation or parent/session work.
    await assert.rejects(
      ctx.subagents.startActivation({ provider: 'spawn', label: 'prerequisite probe', request: {}, signal: new AbortController().signal, delivery: 'caller' }),
      error => error.code === 'NO_PROVIDER',
    )
    assert.deepEqual(ctx.subagents.list(), [], 'failed start must not register a provider')
  } finally {
    for (const fiber of fibers.reverse()) await fiber.dispose()
  }
  assert.equal(ctx.agents, undefined, 'Agent seam must retract with its owner')
  assert.equal(ctx.subagents, undefined, 'Subagent seam must retract with its owner')
})
