import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CALLBACK_COMPLETED_MESSAGE,
  LOGIN_CANCELLED_MESSAGE,
  createSilentBrowserInteraction,
  hangUntilAborted,
} from '../lib/silent.js'

test('silent interaction opens the auth URL and hangs on manual_code until user abort', async () => {
  const opened: string[] = []
  const user = new AbortController()
  const interaction = createSilentBrowserInteraction({
    openUrl: async (url) => {
      opened.push(url)
    },
    signal: user.signal,
  })

  interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/oauth/authorize?x=1' })
  const pending = interaction.prompt({
    type: 'manual_code',
    message: 'paste',
    signal: new AbortController().signal,
  })
  await Promise.resolve()
  assert.deepEqual(opened, ['https://auth.openai.com/oauth/authorize?x=1'])
  user.abort()
  await assert.rejects(pending, (error: unknown) => {
    assert.equal(error instanceof Error && error.message, LOGIN_CANCELLED_MESSAGE)
    return true
  })
})

test('silent interaction returns browser from a select prompt', async () => {
  const interaction = createSilentBrowserInteraction({
    openUrl: async () => {
      assert.fail('select must not open a URL')
    },
  })
  const id = await interaction.prompt({
    type: 'select',
    message: 'method',
    options: [
      { id: 'device_code', label: 'device' },
      { id: 'browser', label: 'browser' },
    ],
  })
  assert.equal(id, 'browser')
})

test('hangUntilAborted rejects when the prompt signal completes the callback', async () => {
  const prompt = new AbortController()
  const pending = hangUntilAborted(prompt.signal, undefined)
  prompt.abort()
  await assert.rejects(pending, (error: unknown) => {
    assert.equal(error instanceof Error && error.message, CALLBACK_COMPLETED_MESSAGE)
    return true
  })
})
