import assert from 'node:assert/strict'
import test from 'node:test'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import '../lib/message-source.js'
import {
  injectedSessionIds,
  sessionReferencesFromMessages,
} from '../lib/mentions.js'
import { formatSessionReferenceMention } from '../lib/uri.js'

test('parses markdown mentions from direct user text only', () => {
  const mention = formatSessionReferenceMention({
    sessionId: 'session-a0a45ae8-e854-454a-9daf-76dbafab4e70',
    label: '列出当前会话信息',
  })
  const userMessage = createUserMessage({
    content: [{ type: 'text', text: `请对照 ${mention} 继续` }],
    source: { kind: 'user' },
  })
  const relay = createUserMessage({
    content: [{ type: 'text', text: mention }],
    source: {
      kind: 'session-relay',
      form: 'relay',
      senderSessionId: SessionId('session-other'),
    },
  })

  assert.deepEqual(sessionReferencesFromMessages([userMessage, relay]), [
    {
      sessionId: 'session-a0a45ae8-e854-454a-9daf-76dbafab4e70',
      label: '列出当前会话信息',
    },
  ])
})

test('ignores bare @title tokens that are not canonical mentions', () => {
  const userMessage = createUserMessage({
    content: [{ type: 'text', text: '@列出当前会话信息' }],
    source: { kind: 'user' },
  })
  assert.deepEqual(sessionReferencesFromMessages([userMessage]), [])
})

test('collects already injected session-reference ids', () => {
  const context = createUserMessage({
    content: [{ type: 'text', text: 'snapshot' }],
    source: {
      kind: 'session-reference',
      form: 'recall',
      version: 1,
      references: [{
        sessionId: 'session-1',
        label: 'one',
        capturedThroughSeq: 4,
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
  assert.deepEqual([...injectedSessionIds([context])], ['session-1'])
})
