import { describe, expect, it } from 'vitest';
import { createUserMessage } from '@deepseek-ai/dsh-llm';

import * as mentions from '../src/mentions.js';

describe('Skill mention parsing', () => {
  it('recognizes a dollar-prefixed Skill at the start of a user message', () => {
    expect(typeof mentions.invokedSkillMentionNames).toBe('function');
    expect(mentions.invokedSkillMentionNames?.('$discuss-first')).toEqual([
      'discuss-first',
    ]);
  });

  it('treats the fullwidth renminbi prefix as the same Skill mention', () => {
    expect(mentions.invokedSkillMentionNames('￥discuss-first')).toEqual([
      'discuss-first',
    ]);
  });

  it('finds whitespace-bounded aliases throughout the message and deduplicates them', () => {
    expect(
      mentions.invokedSkillMentionNames(
        '请用 $discuss-first 和 ￥plugin-creator，再用 $discuss-first',
      ),
    ).toEqual(['discuss-first', 'plugin-creator']);
  });

  it('does not partially invoke shell variables, escaped text, or invalid Skill tokens', () => {
    const cases = [
      '$HOME',
      'foo$bar',
      '\\$name',
      '¥name',
      '$foo_bar',
      '$foo/bar',
    ];

    for (const text of cases) {
      expect(mentions.invokedSkillMentionNames(text), text).toEqual([]);
    }
  });

  it('accepts aliases only from text blocks authored directly by the user', () => {
    const direct = createUserMessage({
      content: [
        { type: 'text', text: '$discuss-first' },
        { type: 'reasoning', text: '$ignored' },
      ],
      source: { kind: 'user' },
    });
    const forged = createUserMessage({
      content: [{ type: 'text', text: '$plugin-creator' }],
      source: { kind: 'plugin', plugin: 'fixture' },
    });

    expect(typeof mentions.invokedSkillMentionNamesFromMessages).toBe(
      'function',
    );
    expect(
      mentions.invokedSkillMentionNamesFromMessages?.([forged, direct]),
    ).toEqual(['discuss-first']);
  });
});
