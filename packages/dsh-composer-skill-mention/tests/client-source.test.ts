import { describe, expect, it } from 'vitest';

import * as sourceModule from '../src/client/source.js';

describe('Composer Skill source', () => {
  it('filters the shared catalog and normalizes a fullwidth pick to dollar text', async () => {
    const catalog = {
      fetch: async () => [
        {
          name: 'discuss-first',
          description: 'Discuss first.',
          modelInvocable: false,
        },
        {
          name: 'plugin-creator',
          description: 'Create plugins.',
          modelInvocable: true,
        },
      ],
      hot: () => undefined,
      warm: () => undefined,
      subscribe: () => () => undefined,
    };

    expect(typeof sourceModule.createSkillMentionSource).toBe('function');
    const source = sourceModule.createSkillMentionSource?.({
      trigger: '￥',
      catalog,
      userOnlyLabel: '仅用户',
    });
    if (!source) throw new Error('expected source');

    const candidates = await source.candidates(
      { sessionId: 'session-1' },
      {
        query: 'dis',
        position: 'leading',
        signal: new AbortController().signal,
      },
    );

    expect(candidates).toEqual([
      {
        name: 'discuss-first',
        description: '仅用户 · Discuss first.',
      },
    ]);
    expect(
      source.onPick({
        candidate: candidates[0]!,
        session: { sessionId: 'session-1' },
        position: 'leading',
        via: 'menu',
        span: { start: 0, end: 4, draftRev: 2 },
      }),
    ).toEqual({ text: '$discuss-first ' });
  });
});
