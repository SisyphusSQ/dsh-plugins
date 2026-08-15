export const SESSION_MENTION_CANDIDATE_LIMIT = 50

export interface SessionMentionRow {
  readonly id: string
  readonly title?: string
  readonly displayTitle: string
  readonly cwd?: string
  readonly origin?: 'subagent'
}

export interface SessionMentionCandidate {
  readonly name: string
  readonly description?: string
  readonly hint: string
  readonly sessionId: string
  readonly label: string
}

function candidateRank(
  candidateCwd: string | undefined,
  targetCwd: string | undefined,
): number {
  if (candidateCwd !== undefined && targetCwd !== undefined && candidateCwd === targetCwd) {
    return 0
  }
  if (candidateCwd === undefined) return 1
  return 2
}

function labelOf(row: SessionMentionRow): string {
  return row.title ?? row.displayTitle
}

/** Rank and filter ordinary sessions for the composer `@` session source. */
export function listSessionMentionCandidates(
  rows: readonly SessionMentionRow[],
  options: {
    readonly currentSessionId: string
    readonly currentCwd?: string
    readonly query: string
    readonly limit?: number
  },
): SessionMentionCandidate[] {
  const needle = options.query.toLocaleLowerCase()
  const limit = options.limit ?? SESSION_MENTION_CANDIDATE_LIMIT
  const usedNames = new Set<string>()

  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.id !== options.currentSessionId && row.origin !== 'subagent')
    .filter(({ row }) => {
      if (needle === '') return true
      return [row.id, row.cwd ?? '', labelOf(row)]
        .some((value) => value.toLocaleLowerCase().includes(needle))
    })
    .sort((left, right) => (
      candidateRank(left.row.cwd, options.currentCwd)
        - candidateRank(right.row.cwd, options.currentCwd)
      || left.index - right.index
    ))
    .slice(0, limit)
    .map(({ row }) => {
      const label = labelOf(row)
      let name = label
      if (usedNames.has(name)) name = `${label} · ${row.id}`
      usedNames.add(name)
      return {
        name,
        ...(row.cwd === undefined ? {} : { description: row.cwd }),
        hint: row.id,
        sessionId: row.id,
        label,
      }
    })
}
