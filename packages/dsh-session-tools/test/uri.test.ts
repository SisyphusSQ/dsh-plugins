import assert from 'node:assert/strict'
import test from 'node:test'
import { encodeSessionReferenceUri as officialEncode } from '@deepseek-ai/dsh-session-reference'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  encodeSessionReferenceUri,
  formatSessionReferenceMention,
} from '../lib/uri.js'

test('mention URI encoding matches the official canonical dsh-session URI', () => {
  const sessionId = 'session-375dc4d4-96f3-4b64-9d1c-3471d135cda7'
  assert.equal(encodeSessionReferenceUri(sessionId), officialEncode(SessionId(sessionId)))
})

test('mention formatting escapes markdown labels', () => {
  assert.equal(
    formatSessionReferenceMention({
      sessionId: 'session-1',
      label: 'foo]bar\\baz',
    }),
    `@[foo\\]bar\\\\baz](${encodeSessionReferenceUri('session-1')})`,
  )
})
