import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT_BYTES = 4 * 1024 * 1024;

export interface GitWorktreeRecord {
  path: string;
  head?: string;
  branch?: string;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  lockReason?: string;
  prunable: boolean;
  pruneReason?: string;
}

export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly stderr: string;
  readonly exitCode?: number | string;

  constructor(
    cwd: string,
    args: readonly string[],
    stderr: string,
    exitCode?: number | string,
  ) {
    const detail = stderr.trim() || "git command failed without stderr";
    super(`git ${args.join(" ")} failed in ${cwd}: ${detail}`);
    this.name = "GitCommandError";
    this.cwd = cwd;
    this.args = [...args];
    this.stderr = stderr;
    if (exitCode !== undefined) this.exitCode = exitCode;
  }
}

export async function runGit(
  cwd: string,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<string> {
  try {
    const result = await execFileAsync("git", [...args], {
      cwd,
      encoding: "utf8",
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      ...(signal === undefined ? {} : { signal }),
    });
    return String(result.stdout);
  } catch (error) {
    if (signal?.aborted === true) throw signal.reason ?? error;
    const failure = error as NodeJS.ErrnoException & {
      stderr?: string | Buffer;
      code?: number | string;
    };
    throw new GitCommandError(
      cwd,
      args,
      failure.stderr === undefined ? "" : String(failure.stderr),
      failure.code,
    );
  }
}

export function parseWorktreePorcelain(output: string): GitWorktreeRecord[] {
  const records: GitWorktreeRecord[] = [];
  let current: GitWorktreeRecord | undefined;

  const finish = (): void => {
    if (current !== undefined) records.push(current);
    current = undefined;
  };

  for (const field of output.split("\0")) {
    if (field === "") {
      finish();
      continue;
    }

    const separator = field.indexOf(" ");
    const key = separator === -1 ? field : field.slice(0, separator);
    const value = separator === -1 ? "" : field.slice(separator + 1);

    if (key === "worktree") {
      finish();
      current = {
        path: value,
        bare: false,
        detached: false,
        locked: false,
        prunable: false,
      };
      continue;
    }
    if (current === undefined) continue;

    if (key === "HEAD") current.head = value;
    else if (key === "branch") current.branch = value;
    else if (key === "bare") current.bare = true;
    else if (key === "detached") current.detached = true;
    else if (key === "locked") {
      current.locked = true;
      if (value !== "") current.lockReason = value;
    } else if (key === "prunable") {
      current.prunable = true;
      if (value !== "") current.pruneReason = value;
    }
  }
  finish();
  return records;
}

export async function listGitWorktrees(
  repository: string,
  signal?: AbortSignal,
): Promise<GitWorktreeRecord[]> {
  return parseWorktreePorcelain(
    await runGit(repository, ["worktree", "list", "--porcelain", "-z"], signal),
  );
}
