import assert from 'node:assert/strict'
import test from 'node:test'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { injectMentionedSessionReferences } from '../lib/inject.js'
import { formatSessionReferenceMention } from '../lib/uri.js'

const caller = { id: SessionId('session-current') } as unknown as Agent

function snapshotMessage(sessionId: string) {
  return createUserMessage({
    content: [{ type: 'text', text: `snapshot ${sessionId}` }],
    source: {
      kind: 'session-reference',
      form: 'recall',
      version: 1,
      references: [{
        sessionId,
        label: sessionId,
        capturedThroughSeq: 1,
        compacted: false,
        originalMessages: 1,
        retainedMessages: 1,
        omittedMessages: 0,
        omittedBytes: 0,
        truncated: false,
        inputIndex: 0,
      }],
    },
  })
}

test('prepends prepared snapshot context ahead of the claimed prompt', async () => {
  const mention = formatSessionReferenceMention({
    sessionId: 'session-listed',
    label: '列出当前会话信息',
  })
  const userMessage = createUserMessage({
    content: [{ type: 'text', text: mention }],
    source: { kind: 'user' },
  })
  const snapshot = snapshotMessage('session-listed')
  const result = await injectMentionedSessionReferences({
    agent: caller,
    claimedMessages: [userMessage],
    decision: { kind: 'enter', messages: [userMessage] },
    prepare: async () => ({ content: userMessage.content, additionalContext: snapshot }),
    signal: new AbortController().signal,
  })

  assert.deepEqual(result, {
    kind: 'enter',
    messages: [snapshot, userMessage],
  })
})

test('does not duplicate a snapshot already injected by read_session', async () => {
  const mention = formatSessionReferenceMention({
    sessionId: 'session-listed',
    label: '列出当前会话信息',
  })
  const userMessage = createUserMessage({
    content: [{ type: 'text', text: mention }],
    source: { kind: 'user' },
  })
  const snapshot = snapshotMessage('session-listed')
  let prepared = 0
  const result = await injectMentionedSessionReferences({
    agent: caller,
    claimedMessages: [userMessage],
    decision: { kind: 'enter', messages: [snapshot, userMessage] },
    prepare: async () => {
      prepared += 1
      return { content: userMessage.content, additionalContext: snapshot }
    },
    signal: new AbortController().signal,
  })

  assert.equal(prepared, 0)
  assert.deepEqual(result, {
    kind: 'enter',
    messages: [snapshot, userMessage],
  })
})

test('propagates prepare failures instead of swallowing them', async () => {
  const mention = formatSessionReferenceMention({
    sessionId: 'session-current',
    label: '自己',
  })
  const userMessage = createUserMessage({
    content: [{ type: 'text', text: mention }],
    source: { kind: 'user' },
  })
  await assert.rejects(
    injectMentionedSessionReferences({
      agent: caller,
      claimedMessages: [userMessage],
      decision: { kind: 'enter', messages: [userMessage] },
      prepare: async () => {
        throw new Error('session session-current cannot reference itself')
      },
      signal: new AbortController().signal,
    }),
    /cannot reference itself/,
  )
})

test('returns reject decisions unchanged', async () => {
  const result = await injectMentionedSessionReferences({
    agent: caller,
    claimedMessages: [],
    decision: { kind: 'reject' },
    prepare: async () => {
      throw new Error('prepare should not run')
    },
    signal: new AbortController().signal,
  })
  assert.deepEqual(result, { kind: 'reject' })
})
