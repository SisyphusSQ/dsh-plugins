import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Script } from 'node:vm'
import test from 'node:test'
import { apply as applySessionClient } from '../lib/client/index.js'
import { formatSessionReferenceMention } from '../lib/uri.js'

const require = createRequire(import.meta.url)

// Consume the published browser entry rather than copying its reference implementation.
// Rendering is not exercised here: only its actual candidate / pick / codec pipeline.
async function nativeReferenceClient() {
  const packagePath = require.resolve('@deepseek-ai/dsh-client-ui-reference/package.json')
  const entry = new URL('./lib/client.js', `file://${packagePath}`)
  let exports: any
  new Script(await readFile(entry, 'utf8'), { filename: entry.pathname }).runInNewContext({
    window: { __ModuleLoader__: { load({ factory }: any) {
      exports = factory((id: string) => {
        if (id === '@deepseek-ai/dsh-client-ui-primitives') {
          return { relativeTime: () => ({ unit: 'now', n: 0 }) }
        }
        if (id === 'react' || id === 'react/jsx-runtime') return {}
        throw new Error(`Unexpected browser dependency ${id}`)
      })
    } } },
    AbortController,
    Date,
    console,
  })
  assert.equal(typeof exports?.apply, 'function')
  return exports
}

test('default client leaves one native reference provider with chip and serialization semantics', async () => {
  const native = await nativeReferenceClient()
  const mention = formatSessionReferenceMention({ sessionId: 'other', label: 'Other session' })
  const sources: any[] = []
  const inputTriggers = {
    registerSource(source: any) {
      assert.equal(sources.some((item) => item.name === source.name), false)
      sources.push(source)
      return () => { sources.splice(sources.indexOf(source), 1) }
    },
  }
  const sessions = {
    list: {
      getSnapshot: () => ({
        ids: ['current', 'other'],
        byId: {
          current: { id: 'current', cwd: '/repo', displayTitle: 'Current' },
          other: { id: 'other', cwd: '/repo', displayTitle: 'Other session', updatedAt: 1 },
        },
      }),
      subscribe: () => () => undefined,
    },
    binding: () => ({}),
    using: async (_id: string, _options: unknown, action: any) => action({
      binding: { session: { getSnapshot: () => ({ openState: 'open' }) } },
    }),
  }
  const services: Record<string, any> = { inputTriggers, sessions }
  const nativeDisposers: (() => void)[] = []
  const pluginDisposers: (() => void)[] = []
  const ctx = {
    ...services,
    get: (key: string) => services[key],
    locale: { register: () => () => undefined, bind: () => (key: string) => key },
    uiConversation: { userText: { register: () => undefined } },
    slots: { inject: () => undefined },
    remote: {
      $host: { home: '/home/test' },
      fileReferences: { list: async () => ({ ok: true, value: [] }) },
      sessionReferenceResolver: { candidates: async () => ({ ok: true, value: [{
        sessionId: 'other', label: 'Other session', displayTitle: 'Other session',
        sameWorkspace: true, createdAt: 1, mention,
      }] }) },
    },
    effect: (action: () => () => void) => { nativeDisposers.push(action()) },
  }
  native.apply(ctx)
  applySessionClient({
    ...ctx,
    effect: (action: () => () => void) => { pluginDisposers.push(action()) },
  } as any)

  try {
    assert.deepEqual(sources.map((source) => source.name), ['reference'])
    const source = sources[0]
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const candidates = await source.candidates({ sessionId: 'current' }, {
        query: 'Other', position: 'inline', signal: new AbortController().signal,
      })
      assert.equal(candidates.length, 1)
      const outcome = source.onPick({ candidate: candidates[0], action: 'pick' })
      assert.deepEqual(JSON.parse(JSON.stringify(outcome)), { insert: {
        source: 'reference', ref: mention, label: 'Other session',
        appearance: 'session', clipboardText: mention,
      } })
      assert.equal(await source.codec.serialize(outcome.insert.ref), mention)
      assert.equal(source.codec.clipboardText(outcome.insert.ref), mention)
    }
    for (const dispose of pluginDisposers) dispose()
    assert.deepEqual(sources.map((source) => source.name), ['reference'])
  } finally {
    for (const dispose of nativeDisposers) dispose()
  }
  assert.equal(sources.length, 0)
})
