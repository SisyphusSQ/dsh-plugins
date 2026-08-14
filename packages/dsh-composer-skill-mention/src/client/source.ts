import type { SkillAliasTrigger } from './detect.js';

export interface ClientSkillEntry {
  readonly name: string;
  readonly description: string;
  readonly modelInvocable: boolean;
}

export interface SkillCatalogView {
  fetch(sessionId: string): Promise<readonly ClientSkillEntry[]>;
  hot(sessionId: string): readonly ClientSkillEntry[] | undefined;
  warm(sessionId: string): void;
  subscribe(sessionId: string, listener: () => void): () => void;
}

export interface SkillMentionSourceOptions {
  readonly trigger: SkillAliasTrigger;
  readonly catalog: SkillCatalogView;
  readonly userOnlyLabel: string;
}

export interface SkillMentionSource {
  readonly trigger: SkillAliasTrigger;
  readonly name: 'skill';
  readonly order: 2;
  candidates(
    session: { readonly sessionId: string },
    request: {
      readonly query: string;
      readonly position: 'leading' | 'inline';
      readonly signal: AbortSignal;
    },
  ): Promise<readonly {
    readonly name: string;
    readonly description: string;
  }[]>;
  warm(session: { readonly sessionId: string }): void;
  lexicon(
    session: { readonly sessionId: string },
  ): readonly string[] | undefined;
  subscribeLexicon(
    session: { readonly sessionId: string },
    listener: () => void,
  ): () => void;
  onPick(pick: {
    readonly candidate: { readonly name: string };
    readonly session: { readonly sessionId: string };
    readonly position: 'leading' | 'inline';
    readonly via: 'menu' | 'space' | 'enter';
    readonly span: {
      readonly start: number;
      readonly end: number;
      readonly draftRev: number;
    };
  }): {
    readonly text: string;
  };
}

export function createSkillMentionSource({
  trigger,
  catalog,
  userOnlyLabel,
}: SkillMentionSourceOptions): SkillMentionSource {
  return {
    trigger,
    name: 'skill',
    order: 2,
    async candidates(session, { query, signal }) {
      const skills = await catalog.fetch(session.sessionId);
      if (signal.aborted) return [];
      return skills
        .filter((skill) => skill.name.startsWith(query))
        .map((skill) => ({
          name: skill.name,
          description: skill.modelInvocable
            ? skill.description
            : `${userOnlyLabel} · ${skill.description}`,
        }));
    },
    warm(session) {
      catalog.warm(session.sessionId);
    },
    lexicon(session) {
      return catalog.hot(session.sessionId)?.map((skill) => skill.name);
    },
    subscribeLexicon(session, listener) {
      return catalog.subscribe(session.sessionId, listener);
    },
    onPick({ candidate }) {
      return { text: `$${candidate.name} ` };
    },
  };
}
