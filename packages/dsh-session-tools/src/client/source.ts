import { formatSessionReferenceMention } from '../uri.js'
import {
  listSessionMentionCandidates,
  type SessionMentionCandidate,
  type SessionMentionRow,
} from './candidates.js'

export interface SessionListSnapshot {
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, SessionMentionRow | undefined>>
}

export interface SessionMentionSourceOptions {
  readonly snapshot: () => SessionListSnapshot
}

export interface SessionMentionSource {
  readonly trigger: '@'
  readonly name: 'session'
  readonly order: -1
  candidates(
    session: { readonly sessionId: string },
    request: {
      readonly query: string
      readonly position: 'leading' | 'inline'
      readonly signal: AbortSignal
    },
  ): Promise<readonly SessionMentionCandidate[]>
  subscribeLexicon(
    session: { readonly sessionId: string },
    listener: () => void,
  ): () => void
  onPick(pick: {
    readonly candidate: SessionMentionCandidate
    readonly session: { readonly sessionId: string }
    readonly position: 'leading' | 'inline'
    readonly via: 'menu' | 'space' | 'enter'
    readonly span: {
      readonly start: number
      readonly end: number
      readonly draftRev: number
    }
  }): { readonly text: string }
}

export function createSessionMentionSource(
  options: SessionMentionSourceOptions & {
    readonly subscribe?: (listener: () => void) => () => void
  },
): SessionMentionSource {
  return {
    trigger: '@',
    name: 'session',
    order: -1,
    async candidates(session, request) {
      if (request.signal.aborted) return []
      const state = options.snapshot()
      const current = state.byId[session.sessionId]
      const rows = state.ids.flatMap((id) => {
        const row = state.byId[id]
        return row === undefined ? [] : [row]
      })
      return listSessionMentionCandidates(rows, {
        currentSessionId: session.sessionId,
        ...(current?.cwd === undefined ? {} : { currentCwd: current.cwd }),
        query: request.query,
      })
    },
    subscribeLexicon(_session, listener) {
      return options.subscribe?.(listener) ?? (() => undefined)
    },
    onPick({ candidate }) {
      return {
        text: `${formatSessionReferenceMention({
          sessionId: candidate.sessionId,
          label: candidate.label,
        })} `,
      }
    },
  }
}
