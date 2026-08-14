import { describe, expect, it } from 'vitest';

import * as detect from '../src/client/detect.js';

describe('Composer alias detection', () => {
  it('detects a leading dollar Skill query and stamps its draft revision', () => {
    expect(typeof detect.detectSkillAlias).toBe('function');
    expect(
      detect.detectSkillAlias?.('$dis', 4, { tier: 'plain' }, 17),
    ).toEqual({
      trigger: '$',
      query: 'dis',
      position: 'leading',
      span: { start: 0, end: 4, draftRev: 17 },
    });
  });

  it('detects a fullwidth renminbi query after whitespace', () => {
    expect(
      detect.detectSkillAlias('请用 ￥plugin', 10, { tier: 'plain' }, 3),
    ).toEqual({
      trigger: '￥',
      query: 'plugin',
      position: 'inline',
      span: { start: 3, end: 10, draftRev: 3 },
    });
  });
});
