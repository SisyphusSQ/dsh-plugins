import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

export interface ModelSelectionCurrent {
  readonly provider: string
  readonly model: string
}

export interface ModelDirectorySnapshot {
  readonly current: ModelSelectionCurrent | null
}

export interface ModelDirectoryFace {
  readonly store: {
    getSnapshot(): ModelDirectorySnapshot
    subscribe(listener: () => void): () => void
  }
  load(): Promise<unknown>
}

export interface ModelDirectoriesFace {
  directoryFor(sessionId: SessionId): ModelDirectoryFace
}

export function currentProviderOf(directory: ModelDirectoryFace): string | null {
  return directory.store.getSnapshot().current?.provider ?? null
}
