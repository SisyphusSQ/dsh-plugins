import { detectSkillAlias, type TriggerGuard } from './detect.js';

type Track = (
  this: unknown,
  draft: string,
  caret: number,
  guard: TriggerGuard,
  draftRev: number,
) => void;

interface SnapshotStore<T> {
  getSnapshot(): T;
  set(value: T): void;
}

interface Rc6Controller {
  disposed: boolean;
  launcher: SnapshotStore<unknown>;
  menu: SnapshotStore<any>;
  hit: unknown;
  deps: {
    roster: {
      sources(trigger: string): readonly { readonly name: string }[];
    };
  };
  clearLauncher(): void;
  stopFetch(): void;
  reduce(event: unknown): void;
  fetchCandidates(hit: unknown, sources: readonly unknown[]): void;
}

interface PatchState {
  readonly original: Track;
  readonly patched: Track;
  references: number;
  warned: boolean;
}

const PATCH_STATE = Symbol.for(
  'dsh-composer-skill-mention/input-trigger-rc6-patch',
);

function isRc6Controller(value: unknown): value is Rc6Controller {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Rc6Controller>;
  return (
    typeof candidate.disposed === 'boolean' &&
    typeof candidate.launcher?.getSnapshot === 'function' &&
    typeof candidate.menu?.getSnapshot === 'function' &&
    typeof candidate.menu?.set === 'function' &&
    typeof candidate.deps?.roster?.sources === 'function' &&
    typeof candidate.clearLauncher === 'function' &&
    typeof candidate.stopFetch === 'function' &&
    typeof candidate.reduce === 'function' &&
    typeof candidate.fetchCandidates === 'function'
  );
}

function runAliasTrack(
  controller: Rc6Controller,
  draft: string,
  caret: number,
  guard: TriggerGuard,
  draftRev: number,
): boolean {
  const hit = detectSkillAlias(draft, caret, guard, draftRev);
  if (hit === null) return false;
  if (controller.disposed) return true;

  const launched = controller.launcher.getSnapshot() !== null;
  controller.clearLauncher();
  const previous = controller.menu.getSnapshot();
  const same =
    !launched &&
    previous.open === true &&
    previous.hit !== null &&
    previous.hit.trigger === hit.trigger &&
    previous.hit.query === hit.query &&
    previous.hit.span.start === hit.span.start &&
    previous.hit.span.end === hit.span.end;

  controller.hit = hit;
  if (same) return true;

  const sources = controller.deps.roster.sources(hit.trigger);
  if (sources.length === 0) {
    controller.stopFetch();
    controller.reduce({ type: 'close' });
    return true;
  }

  if (
    launched ||
    previous.open !== true ||
    previous.hit === null ||
    previous.hit.trigger !== hit.trigger
  ) {
    controller.menu.set({
      ...controller.menu.getSnapshot(),
      groups: sources.map((source) => ({
        source: source.name,
        status: 'pending',
        items: [],
      })),
      highlight: null,
    });
  }
  controller.reduce({ type: 'hit', hit });
  controller.fetchCandidates(hit, sources);
  return true;
}

export function installInputTriggerCompat<T extends new (...args: any[]) => any>(
  Controller: T,
): () => void {
  const prototype = Controller.prototype as {
    track?: Track;
    [PATCH_STATE]?: PatchState;
  };
  const existing = prototype[PATCH_STATE];
  if (existing && prototype.track === existing.patched) {
    existing.references += 1;
    return createDisposer(prototype, existing);
  }
  if (typeof prototype.track !== 'function') {
    throw new Error(
      'dsh-composer-skill-mention: rc.6 InputTriggerController.track is unavailable',
    );
  }

  const original = prototype.track;
  const state: PatchState = {
    original,
    references: 1,
    warned: false,
    patched: function patchedTrack(draft, caret, guard, draftRev) {
      if (!detectSkillAlias(draft, caret, guard, draftRev)) {
        return original.call(this, draft, caret, guard, draftRev);
      }
      if (!isRc6Controller(this)) {
        if (!state.warned) {
          state.warned = true;
          console.error(
            'dsh-composer-skill-mention: unsupported rc.6 input-trigger controller shape; aliases disabled',
          );
        }
        return original.call(this, draft, caret, guard, draftRev);
      }
      runAliasTrack(this, draft, caret, guard, draftRev);
    },
  };
  prototype.track = state.patched;
  prototype[PATCH_STATE] = state;
  return createDisposer(prototype, state);
}

function createDisposer(
  prototype: { track?: Track; [PATCH_STATE]?: PatchState },
  state: PatchState,
): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    state.references -= 1;
    if (state.references > 0) return;
    if (prototype.track === state.patched) prototype.track = state.original;
    if (prototype[PATCH_STATE] === state) delete prototype[PATCH_STATE];
  };
}
