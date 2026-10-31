/**
 * Zoom row slot store: the live choice, reconciled with the durable preference.
 *
 * The plugin's apply-world change listener is the only writer; the row
 * component reads through `props.useStore`. The revision guard makes the
 * first sync land even when the service revision is still 0.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import { DEFAULT_ZOOM_PERCENT } from '../settings.js'

/** Store state mirrored from the durable zoom preference. */
export interface UiZoomRowState {
  /** Persisted whole-interface zoom in percent. */
  zoomPercent: number
  /** The latest local write was refused or could not be confirmed. */
  saveFailed?: boolean
  /** Service revision; -1 until the first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type UiZoomRowActions = {
  sync: (draft: UiZoomRowState, zoomPercent: number, revision: number, saveFailed?: boolean) => void
}

/**
 * Declare the zoom row state and write surface.
 * @returns The store handle.
 */
export function createUiZoomRowStore(): EngineStoreHandle<UiZoomRowState, UiZoomRowActions> {
  return defineStore({
    init: (): UiZoomRowState => ({ zoomPercent: DEFAULT_ZOOM_PERCENT, revision: -1, saveFailed: false }),
    actions: {
      sync: (draft, zoomPercent, revision, saveFailed = false) => {
        if (revision <= draft.revision) return
        draft.zoomPercent = zoomPercent
        draft.revision = revision
        draft.saveFailed = saveFailed
      },
    },
  })
}
