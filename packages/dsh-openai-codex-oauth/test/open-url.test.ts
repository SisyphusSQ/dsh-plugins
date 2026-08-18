import assert from 'node:assert/strict'
import test from 'node:test'

import { assertHttpUrl } from '../lib/open-url.js'

test('assertHttpUrl accepts http and https', () => {
  assert.equal(assertHttpUrl('https://auth.openai.com/oauth/authorize').protocol, 'https:')
  assert.equal(assertHttpUrl('http://127.0.0.1:1455/auth/callback').protocol, 'http:')
})

test('assertHttpUrl refuses non-http schemes', () => {
  assert.throws(() => assertHttpUrl('file:///tmp/oauth'), /non-http/)
})
