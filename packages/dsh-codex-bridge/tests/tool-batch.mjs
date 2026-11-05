import assert from 'node:assert/strict'

/** Exercise the target batch dispatcher and real selected executor, without logging a model step. */
export async function executeTool(ctx, { name, callId, arguments: args, ...context }) {
  const batch = await ctx.tools.execute({
    ...context,
    calls: [{ type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) }],
  })
  assert.equal(batch.results.length, 1)
  assert.equal(batch.results[0].callId, callId)
  return batch.results[0].result
}
