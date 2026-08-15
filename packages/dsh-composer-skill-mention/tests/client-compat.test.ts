import { describe, expect, it } from 'vitest';

import * as compat from '../src/client/compat.js';

interface MenuState {
  open: boolean;
  hit: null | { trigger: string; query: string; span: { start: number; end: number } };
  generation: number;
  groups: { source: string; status: 'pending'; items: never[] }[];
  highlight: null;
}

class FixtureController {
  originalCalls = 0;
  fetched: unknown[] = [];
  disposed = false;
  hit: unknown = null;
  fetch = null;
  launcher = store<string | null>(null);
  menu = store<MenuState>({
    open: false,
    hit: null,
    generation: 0,
    groups: [],
    highlight: null,
  });
  deps = {
    roster: {
      sources: (trigger: string) =>
        trigger === '$' ? [{ name: 'skill' }] : [],
    },
  };

  track(
    _draft: string,
    _caret: number,
    _guard: { readonly tier: 'plain' | 'claimed' | 'frozen' },
    _draftRev: number,
  ): void {
    this.originalCalls += 1;
  }

  clearLauncher(): void {
    this.launcher.set(null);
  }

  stopFetch(): void {
    this.fetch = null;
  }

  reduce(event: { type: 'close' } | { type: 'hit'; hit: MenuState['hit'] }): void {
    if (event.type === 'close') {
      this.menu.set({
        ...this.menu.getSnapshot(),
        open: false,
        hit: null,
        groups: [],
      });
      return;
    }
    this.menu.set({
      ...this.menu.getSnapshot(),
      open: true,
      hit: event.hit,
      generation: this.menu.getSnapshot().generation + 1,
    });
  }

  fetchCandidates(hit: unknown, sources: unknown[]): void {
    this.fetched.push({ hit, sources });
  }
}

function store<T>(initial: T) {
  let value = initial;
  return {
    getSnapshot: () => value,
    set(next: T) {
      value = next;
    },
  };
}

describe('rc.6 input-trigger compatibility layer', () => {
  it('routes a dollar hit through the existing controller state machine and restores track', () => {
    expect(typeof compat.installInputTriggerCompat).toBe('function');
    const originalTrack = FixtureController.prototype.track;
    const dispose = compat.installInputTriggerCompat?.(FixtureController);
    if (!dispose) throw new Error('expected disposer');
    const controller = new FixtureController();

    controller.track('$dis', 4, { tier: 'plain' }, 9);

    expect(controller.originalCalls).toBe(0);
    expect(controller.menu.getSnapshot()).toMatchObject({
      open: true,
      hit: {
        trigger: '$',
        query: 'dis',
        span: { start: 0, end: 4, draftRev: 9 },
      },
      groups: [{ source: 'skill', status: 'pending', items: [] }],
    });
    expect(controller.fetched).toHaveLength(1);

    dispose();
    expect(FixtureController.prototype.track).toBe(originalTrack);
  });
});
