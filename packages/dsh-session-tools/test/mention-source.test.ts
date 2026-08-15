import assert from 'node:assert/strict'
import test from 'node:test'
import { listSessionMentionCandidates } from '../lib/client/candidates.js'
import { createSessionMentionSource } from '../lib/client/source.js'
import { formatSessionReferenceMention } from '../lib/uri.js'

test('filters ordinary sessions by title and ranks same cwd first', () => {
  const candidates = listSessionMentionCandidates([
    {
      id: 'session-current',
      displayTitle: '查询fixture仓库会话记录',
      cwd: '/Users/suqing/.dsh/e2e/dsh-git-worktree/fixture-repo',
    },
    {
      id: 'session-listed',
      title: '列出当前会话信息',
      displayTitle: '列出当前会话信息',
      cwd: '/Users/suqing/.dsh/e2e/dsh-git-worktree/fixture-repo',
    },
    {
      id: 'session-other-cwd',
      displayTitle: '列出账单',
      cwd: '/tmp/other',
    },
    {
      id: 'session-child',
      displayTitle: '列出子任务',
      origin: 'subagent',
    },
  ], {
    currentSessionId: 'session-current',
    currentCwd: '/Users/suqing/.dsh/e2e/dsh-git-worktree/fixture-repo',
    query: '列出',
  })

  assert.deepEqual(candidates.map((candidate) => candidate.sessionId), [
    'session-listed',
    'session-other-cwd',
  ])
  assert.equal(candidates[0]?.name, '列出当前会话信息')
  assert.equal(candidates[0]?.hint, 'session-listed')
})

test('disambiguates duplicate titles in the menu name', () => {
  const candidates = listSessionMentionCandidates([
    { id: 'session-a', displayTitle: '同名' },
    { id: 'session-b', displayTitle: '同名' },
  ], {
    currentSessionId: 'session-current',
    query: '',
  })

  assert.deepEqual(candidates.map((candidate) => candidate.name), [
    '同名',
    '同名 · session-b',
  ])
  assert.deepEqual(candidates.map((candidate) => candidate.label), ['同名', '同名'])
})

test('inserts a canonical markdown mention on pick', async () => {
  const source = createSessionMentionSource({
    snapshot: () => ({
      ids: ['session-current', 'session-listed'],
      byId: {
        'session-current': {
          id: 'session-current',
          displayTitle: '当前',
          cwd: '/repo',
        },
        'session-listed': {
          id: 'session-listed',
          displayTitle: '列出当前会话信息',
          cwd: '/repo',
        },
      },
    }),
  })

  const candidates = await source.candidates(
    { sessionId: 'session-current' },
    {
      query: '列出',
      position: 'inline',
      signal: new AbortController().signal,
    },
  )
  assert.equal(candidates.length, 1)
  assert.deepEqual(source.onPick({
    candidate: candidates[0]!,
    session: { sessionId: 'session-current' },
    position: 'inline',
    via: 'menu',
    span: { start: 0, end: 3, draftRev: 1 },
  }), {
    text: `${formatSessionReferenceMention({
      sessionId: 'session-listed',
      label: '列出当前会话信息',
    })} `,
  })
})
