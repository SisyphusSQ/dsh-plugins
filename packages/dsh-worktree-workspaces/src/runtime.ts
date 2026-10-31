/** Execution-world operations shared by the standalone and caller-confined Host paths. */
export interface WorktreeRuntime {
  readonly cwd: string;
  git(cwd: string, args: readonly string[], signal?: AbortSignal): Promise<string>;
  realpath(path: string, signal?: AbortSignal): Promise<string>;
  ensureDirectory(path: string, signal?: AbortSignal): Promise<string>;
  mkdir(path: string, signal?: AbortSignal): Promise<void>;
  removeGeneratedParent(base: string, parent: string, signal?: AbortSignal): Promise<void>;
}
