import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { SkillDefinition } from '@deepseek-ai/dsh-skill';
import { describe, expect, it } from 'vitest';

import * as host from '../src/index.js';

const discussFirst: SkillDefinition = {
  name: 'discuss-first',
  description: 'Discuss before implementation.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'runtime',
  provider: 'fixture',
  content: 'Do not edit until the user approves.',
};

const pluginCreator: SkillDefinition = {
  ...discussFirst,
  name: 'plugin-creator',
  content: 'Create the plugin package.',
};

const privateSkill: SkillDefinition = {
  ...discussFirst,
  name: 'private-skill',
  invocation: { modelInvocable: true, userInvocable: false },
};

describe('Host Skill injection', () => {
  it('appends canonical Skill instructions for a direct dollar mention', async () => {
    const userMessage = createUserMessage({
      content: [{ type: 'text', text: '请先用 $discuss-first' }],
      source: { kind: 'user' },
    });
    const decision = { kind: 'enter' as const, messages: [userMessage] };

    expect(typeof host.appendMentionedSkillInjections).toBe('function');
    const result = await host.appendMentionedSkillInjections?.({
      claimedMessages: [userMessage],
      decision,
      loadSkill: async (name: string) =>
        name === 'discuss-first' ? discussFirst : undefined,
    });

    expect(result?.kind).toBe('enter');
    if (result?.kind !== 'enter') throw new Error('expected enter decision');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]?.source).toEqual({
      kind: 'skill-invocation',
      name: 'discuss-first',
      form: 'instructions',
    });
    expect(result.messages[1]?.content).toEqual([
      {
        type: 'text',
        text: '<skill_content name="discuss-first">\n<skill_resources>\nResources for this skill are managed by provider "fixture".\nLoad referenced resources only as needed.\n</skill_resources>\n\n<skill_instructions>\nDo not edit until the user approves.\n</skill_instructions>\n</skill_content>',
      },
    ]);
  });

  it('deduplicates downstream slash injections and skips unavailable aliases', async () => {
    const userMessage = createUserMessage({
      content: [
        {
          type: 'text',
          text: '/discuss-first $discuss-first ￥plugin-creator $private-skill $missing',
        },
      ],
      source: { kind: 'user' },
    });
    const slashInjection = createUserMessage({
      content: [{ type: 'text', text: 'already injected' }],
      source: {
        kind: 'skill-invocation',
        name: 'discuss-first',
        form: 'instructions',
      },
    });

    const result = await host.appendMentionedSkillInjections?.({
      claimedMessages: [userMessage],
      decision: {
        kind: 'enter',
        messages: [userMessage, slashInjection],
      },
      loadSkill: async (name: string) => {
        if (name === 'discuss-first') return discussFirst;
        if (name === 'plugin-creator') return pluginCreator;
        if (name === 'private-skill') return privateSkill;
        return undefined;
      },
    });

    if (result?.kind !== 'enter') throw new Error('expected enter decision');
    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((message) => message.source)).toEqual([
      { kind: 'user' },
      {
        kind: 'skill-invocation',
        name: 'discuss-first',
        form: 'instructions',
      },
      {
        kind: 'skill-invocation',
        name: 'plugin-creator',
        form: 'instructions',
      },
    ]);
  });
});
