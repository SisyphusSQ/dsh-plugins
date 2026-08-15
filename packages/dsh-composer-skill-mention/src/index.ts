import type { PreStepDecision } from '@deepseek-ai/dsh-agent';
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm';
import {
  isUserInvocable,
  renderSkillContent,
  type SkillDefinition,
} from '@deepseek-ai/dsh-skill';

import { invokedSkillMentionNamesFromMessages } from './mentions.js';

export interface AppendMentionedSkillInjectionsOptions {
  readonly claimedMessages: readonly UserMessage[];
  readonly decision: PreStepDecision;
  readonly loadSkill: (
    name: string,
  ) => Promise<SkillDefinition | undefined>;
}

export async function appendMentionedSkillInjections({
  claimedMessages,
  decision,
  loadSkill,
}: AppendMentionedSkillInjectionsOptions): Promise<PreStepDecision> {
  if (decision.kind === 'reject') return decision;

  const injectedNames = new Set(
    decision.messages.flatMap((message) =>
      message.source.kind === 'skill-invocation' ? [message.source.name] : [],
    ),
  );
  const injections: UserMessage[] = [];
  for (const name of invokedSkillMentionNamesFromMessages(claimedMessages)) {
    if (injectedNames.has(name)) continue;
    const skill = await loadSkill(name);
    if (!skill || !isUserInvocable(skill)) continue;
    injections.push(
      createUserMessage({
        content: [{ type: 'text', text: renderSkillContent(skill) }],
        source: {
          kind: 'skill-invocation',
          name,
          form: 'instructions',
        },
      }),
    );
    injectedNames.add(name);
  }

  if (injections.length === 0) return decision;
  return { kind: 'enter', messages: [...decision.messages, ...injections] };
}

export const name = 'composer-skill-mention';
export const inject = ['skills'];

export function apply(ctx: Context): void {
  ctx.on(
    'agent/pre-step',
    async ({ agent, messages, signal }, next) => {
      const decision = await next();
      if (decision.kind === 'reject') return decision;
      signal.throwIfAborted();

      return appendMentionedSkillInjections({
        claimedMessages: messages,
        decision,
        loadSkill: async (skillName) => {
          const skill = await ctx.skills.get(skillName, {
            cwd: agent.session.header.cwd,
            signal,
            scope: agent,
          });
          signal.throwIfAborted();
          return skill;
        },
      });
    },
    { prepend: true },
  );
}

export {
  invokedSkillMentionNames,
  invokedSkillMentionNamesFromMessages,
} from './mentions.js';
import type { Context } from '@deepseek-ai/cordis';
