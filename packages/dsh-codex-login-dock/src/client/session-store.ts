/**
 * Main-view session store for the Settings section.
 *
 * DSH 0.2 removed `SessionListState.current` (Session references became
 * multi-instance), so a root-scoped settings row can no longer read the
 * selected Session from the `useSessions` list state. The plugin's apply world
 * is the only writer here: it mirrors `ctx.uiSession.adapter.current` — whose
 * binding key is the Session id retained by the main view — and the component
 * reads through `props.useStore`.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'

/** Store state mirrored from the renderer's main Session binding. */
export interface MainSessionState {
  /** Session id retained by the main view; absent while none is selected. */
  sessionId: SessionId | undefined
}

/** Declared action shape giving the exported factory a stable return type. */
type MainSessionActions = {
  sync: (draft: MainSessionState, sessionId: SessionId | undefined) => void
}

/**
 * Declare the main-session state and write surface.
 * @returns The store handle.
 */
export function createMainSessionStore(): EngineStoreHandle<MainSessionState, MainSessionActions> {
  return defineStore({
    init: (): MainSessionState => ({ sessionId: undefined }),
    actions: {
      sync: (draft, sessionId) => {
        if (draft.sessionId === sessionId) return
        draft.sessionId = sessionId
      },
    },
  })
}
