import assert from 'node:assert/strict'
import test from 'node:test'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionRecord, SessionTitleObservationResult } from '@deepseek-ai/dsh-session-query'
import { buildSessionList } from '../lib/session-list.js'

function header(id: string, overrides: Partial<SessionHeader> = {}): SessionHeader {
  return {
    version: 0,
    id: SessionId(id),
    createdAt: 1,
    ...overrides,
  }
}

test('buildSessionList excludes subagent-owned sessions', () => {
  const records: SessionRecord[] = [
    { header: header('ordinary'), live: true, persisted: true },
    { header: header('child', { origin: 'subagent', delegationDepth: 1 }), live: true, persisted: true },
  ]
  const titles: SessionTitleObservationResult[] = []

  const result = buildSessionList(records, titles, {
    currentSessionId: SessionId('ordinary'),
    query: '',
    limit: 50,
  })

  assert.deepEqual(result.map((item) => item.sessionId), ['ordinary'])
})

test('buildSessionList uses folded titles and falls back to the session id', () => {
  const titled = header('titled', { cwd: '/repo/a', createdAt: 3 })
  const untitled = header('untitled', { createdAt: 2 })
  const unreadable = header('unreadable', { createdAt: 1 })
  const records: SessionRecord[] = [
    { header: titled, live: true, persisted: true },
    { header: untitled, live: false, persisted: true },
    { header: unreadable, live: false, persisted: true },
  ]
  const titles: SessionTitleObservationResult[] = [
    {
      sessionId: titled.id,
      status: 'fulfilled',
      value: {
        session: titled,
        title: {
          title: 'Alpha Session',
          messageSeqs: [1],
          source: { kind: 'fallback' },
          eventSeq: 2,
          updatedAt: 10,
        },
      },
    },
    { sessionId: untitled.id, status: 'fulfilled', value: { session: untitled } },
    { sessionId: unreadable.id, status: 'rejected', reason: new Error('unreadable') },
  ]

  const result = buildSessionList(records, titles, {
    currentSessionId: untitled.id,
    query: '',
    limit: 50,
  })

  assert.deepEqual(result, [
    {
      sessionId: 'titled',
      title: 'Alpha Session',
      cwd: '/repo/a',
      createdAt: 3,
      live: true,
      persisted: true,
      current: false,
    },
    {
      sessionId: 'untitled',
      title: 'untitled',
      createdAt: 2,
      live: false,
      persisted: true,
      current: true,
    },
    {
      sessionId: 'unreadable',
      title: 'unreadable',
      createdAt: 1,
      live: false,
      persisted: true,
      current: false,
    },
  ])
})

test('buildSessionList filters id, title, and cwd case-insensitively', () => {
  const idMatch = header('TARGET-id')
  const titleMatch = header('second')
  const cwdMatch = header('third', { cwd: '/Work/TARGET' })
  const miss = header('fourth', { cwd: '/elsewhere' })
  const records: SessionRecord[] = [idMatch, titleMatch, cwdMatch, miss].map((session) => ({
    header: session,
    live: false,
    persisted: true,
  }))
  const titles: SessionTitleObservationResult[] = [{
    sessionId: titleMatch.id,
    status: 'fulfilled',
    value: {
      session: titleMatch,
      title: {
        title: 'Target title',
        messageSeqs: [],
        source: { kind: 'user' },
        eventSeq: 1,
        updatedAt: 2,
      },
    },
  }]

  const result = buildSessionList(records, titles, {
    currentSessionId: SessionId('current'),
    query: 'target',
    limit: 50,
  })

  assert.deepEqual(result.map((item) => item.sessionId), ['TARGET-id', 'second', 'third'])
})

test('buildSessionList preserves corpus order and applies the requested limit', () => {
  const records: SessionRecord[] = ['newest', 'middle', 'oldest'].map((id, index) => ({
    header: header(id, { createdAt: 3 - index }),
    live: false,
    persisted: true,
  }))

  const result = buildSessionList(records, [], {
    currentSessionId: SessionId('current'),
    query: '',
    limit: 2,
  })

  assert.deepEqual(result.map((item) => item.sessionId), ['newest', 'middle'])
})
