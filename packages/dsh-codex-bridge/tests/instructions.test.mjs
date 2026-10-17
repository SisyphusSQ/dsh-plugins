import { test } from 'node:test'
import assert from 'node:assert/strict'
import { instructionUpdate } from '../lib/instructions.js'

const catalog = (content = 'Be careful.') => ({ home: '/codex/home', instructions: content === undefined ? undefined : { content, digest: 'original' }, skills: [] })
const agent = events => ({ session: { surface: { nodes: events.map((_, index) => index) }, eventAt: index => events[index] } })

test('instructions deduplicate only admitted visible revisions', () => {
  const first = instructionUpdate(agent([]), [], catalog())
  assert.equal(first.source.kind, 'suqingsq-codex-home')
  assert.match(first.content[0].text, /workspace instructions take precedence/)
  // A failed step never appended the prepared message, so the next attempt repeats it.
  const retry = instructionUpdate(agent([]), [], catalog())
  assert.deepEqual(retry.source, first.source)
  assert.deepEqual(retry.content, first.content)
  const admitted = agent([{ type: 'user/message', data: first }])
  assert.equal(instructionUpdate(admitted, [], catalog()), undefined)
  assert.ok(instructionUpdate(admitted, [], catalog('Changed.')))
  // Compaction removed the visible baseline: re-admit it rather than trusting RAM.
  assert.ok(instructionUpdate(agent([]), [], catalog()))
})
test('switch-off emits one logged retraction, not a message on every step', () => {
  const empty = { home: '/codex/home', skills: [] }
  assert.equal(instructionUpdate(agent([]), [], empty), undefined)
  const first = instructionUpdate(agent([]), [], catalog())
  const retract = instructionUpdate(agent([{ type: 'user/message', data: first }]), [], empty)
  assert.equal(retract.source.enabled, false)
  assert.match(retract.content[0].text, /no longer apply/)
  assert.equal(instructionUpdate(agent([{ type: 'user/message', data: retract }]), [], empty), undefined)
})
test('skill alias routing changes update the rendered instruction digest', () => {
  const original = { ...catalog('Use $plugin:skill'), skills: [{ originalName: 'plugin:skill', name: 'first' }] }
  const first = instructionUpdate(agent([]), [], original)
  const changed = { ...original, skills: [{ originalName: 'plugin:skill', name: 'second' }] }
  assert.ok(instructionUpdate(agent([{ type: 'user/message', data: first }]), [], changed))
})
