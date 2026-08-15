import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionRecord, SessionTitleObservationResult } from '@deepseek-ai/dsh-session-query'

export interface SessionListItem {
  sessionId: string
  title: string
  cwd?: string
  createdAt: number
  parentSessionId?: string
  agentPreset?: string
  live: boolean
  persisted: boolean
  current: boolean
}

export interface SessionListOptions {
  currentSessionId: SessionId
  query: string
  limit: number
}

export function buildSessionList(
  records: readonly SessionRecord[],
  titles: readonly SessionTitleObservationResult[],
  options: SessionListOptions,
): SessionListItem[] {
  const titleBySession = new Map(
    titles.flatMap((result) => result.status === 'fulfilled' && result.value.title !== undefined
      ? [[result.sessionId, result.value.title.title] as const]
      : []),
  )
  const query = options.query.trim().toLocaleLowerCase()

  return records
    .filter((record) => record.header.origin !== 'subagent')
    .map((record) => ({
      sessionId: record.header.id,
      title: titleBySession.get(record.header.id) ?? record.header.id,
      ...(record.header.cwd === undefined ? {} : { cwd: record.header.cwd }),
      createdAt: record.header.createdAt,
      ...(record.header.parentSession === undefined ? {} : { parentSessionId: record.header.parentSession }),
      ...(record.header.agentPreset === undefined ? {} : { agentPreset: record.header.agentPreset }),
      live: record.live,
      persisted: record.persisted,
      current: record.header.id === options.currentSessionId,
    }))
    .filter((item) => query === '' || [item.sessionId, item.title, item.cwd ?? '']
      .some((value) => value.toLocaleLowerCase().includes(query)))
    .slice(0, options.limit)
}
