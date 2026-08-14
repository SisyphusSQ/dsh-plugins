const SKILL_MENTION =
  /(?:^|\s)[$￥]([a-z0-9]+(?:-[a-z0-9]+)*)(?![A-Za-z0-9_@\/\\-])/g;

export function invokedSkillMentionNames(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(SKILL_MENTION)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names];
}

export function invokedSkillMentionNamesFromMessages(
  messages: readonly UserMessage[],
): string[] {
  const names = new Set<string>();
  for (const message of messages) {
    if (message.source.kind !== 'user') continue;
    for (const block of message.content) {
      if (block.type !== 'text') continue;
      for (const name of invokedSkillMentionNames(block.text)) names.add(name);
    }
  }
  return [...names];
}
import type { UserMessage } from '@deepseek-ai/dsh-llm';
