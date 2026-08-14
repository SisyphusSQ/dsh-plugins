export type SkillAliasTrigger = '$' | '￥';

export interface TriggerGuard {
  readonly tier: 'plain' | 'claimed' | 'frozen';
}

export interface SkillAliasHit {
  readonly trigger: SkillAliasTrigger;
  readonly query: string;
  readonly position: 'leading' | 'inline';
  readonly span: {
    readonly start: number;
    readonly end: number;
    readonly draftRev: number;
  };
}

export function detectSkillAlias(
  draft: string,
  caret: number,
  guard: TriggerGuard,
  draftRev: number,
): SkillAliasHit | null {
  if (guard.tier !== 'plain') return null;
  for (let index = caret - 1; index >= 0; index -= 1) {
    const character = draft.charAt(index);
    if (/\s/.test(character)) return null;
    if (character !== '$' && character !== '￥') continue;
    if (index > 0 && !/\s/.test(draft.charAt(index - 1))) return null;
    return {
      trigger: character,
      query: draft.slice(index + 1, caret),
      position: draft.search(/\S/) === index ? 'leading' : 'inline',
      span: { start: index, end: caret, draftRev },
    };
  }
  return null;
}
