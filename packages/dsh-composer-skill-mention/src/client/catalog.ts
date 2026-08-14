import type { ClientSkillEntry } from './source.js';

export type { ClientSkillEntry } from './source.js';

export type FetchSkillCatalog = (
  sessionId: string,
  signal: AbortSignal,
) => Promise<readonly ClientSkillEntry[]>;

interface CatalogEntry {
  readonly abort: AbortController;
  promise: Promise<readonly ClientSkillEntry[]>;
  settled?: readonly ClientSkillEntry[];
}

export interface SkillCatalog {
  fetch(sessionId: string): Promise<readonly ClientSkillEntry[]>;
  hot(sessionId: string): readonly ClientSkillEntry[] | undefined;
  warm(sessionId: string): void;
  subscribe(sessionId: string, listener: () => void): () => void;
  invalidate(sessionId: string): void;
  clear(): void;
}

export function createSkillCatalog(fetchCatalog: FetchSkillCatalog): SkillCatalog {
  const entries = new Map<string, CatalogEntry>();
  const listeners = new Map<string, Set<() => void>>();

  const notify = (sessionId: string) => {
    for (const listener of [...(listeners.get(sessionId) ?? [])]) {
      try {
        listener();
      } catch (error) {
        console.error('[dsh-composer-skill-mention] catalog listener failed:', error);
      }
    }
  };

  const fetch = (sessionId: string) => {
    const existing = entries.get(sessionId);
    if (existing) return existing.promise;

    const abort = new AbortController();
    const entry: CatalogEntry = {
      abort,
      promise: Promise.resolve([]),
    };
    entry.promise = fetchCatalog(sessionId, abort.signal);
    entries.set(sessionId, entry);
    entry.promise.then(
      (skills) => {
        if (entries.get(sessionId) !== entry) return;
        entry.settled = skills;
        notify(sessionId);
      },
      () => {
        if (entries.get(sessionId) === entry) entries.delete(sessionId);
      },
    );
    return entry.promise;
  };

  const invalidate = (sessionId: string) => {
    const entry = entries.get(sessionId);
    if (!entry) return;
    entries.delete(sessionId);
    entry.abort.abort();
    notify(sessionId);
  };

  return {
    fetch,
    hot(sessionId) {
      return entries.get(sessionId)?.settled;
    },
    warm(sessionId) {
      void fetch(sessionId).catch(() => undefined);
    },
    subscribe(sessionId, listener) {
      const sessionListeners = listeners.get(sessionId) ?? new Set();
      sessionListeners.add(listener);
      listeners.set(sessionId, sessionListeners);
      return () => {
        sessionListeners.delete(listener);
        if (sessionListeners.size === 0) listeners.delete(sessionId);
      };
    },
    invalidate,
    clear() {
      for (const sessionId of [...entries.keys()]) invalidate(sessionId);
    },
  };
}
