import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { parseWorktreePorcelain } from "./git.js";
import { assertPathInside } from "./paths.js";
import type { WorktreeRuntime } from "./runtime.js";
import { standaloneRuntime } from "./standalone-runtime.js";

export type WorktreeTarget =
  | { type: "new-branch"; branch: string; startPoint?: string }
  | { type: "existing-branch"; branch: string }
  | { type: "detached"; startPoint?: string };

export interface CreateWorktreeOptions {
  repository: string;
  target: WorktreeTarget;
  baseDir: string;
  signal?: AbortSignal;
  worktreeId?: string;
  /** Host callers must supply their caller-confined execution world. Omission is standalone Node. */
  runtime?: WorktreeRuntime;
}

export interface CreateWorktreeResult {
  worktreeId: string;
  path: string;
  repositoryRoot: string;
  commonGitDir: string;
  mode: WorktreeTarget["type"];
  branch?: string;
  headCommit: string;
  sourceDirty: boolean;
  next: { cwd: string };
}

interface RepositoryIdentity {
  root: string;
  commonGitDir: string;
}

function validatedRef(input: string, label: string): string {
  const value = input.trim();
  if (value === "") throw new Error(`${label} must not be empty`);
  if (value.startsWith("-")) throw new Error(`${label} must not start with '-'`);
  if (value.includes("\0")) throw new Error(`${label} must not contain NUL`);
  return value;
}

async function resolveRepository(
  runtime: WorktreeRuntime,
  input: string,
  signal?: AbortSignal,
): Promise<RepositoryIdentity> {
  const candidate = resolve(runtime.cwd, input);
  const rootText = await runtime.git(candidate, ["rev-parse", "--show-toplevel"], signal);
  const root = await runtime.realpath(rootText.trim(), signal);
  const commonText = await runtime.git(
    root,
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    signal,
  );
  const commonCandidate = commonText.trim();
  const commonGitDir = await runtime.realpath(
    isAbsolute(commonCandidate) ? commonCandidate : resolve(root, commonCandidate), signal,
  );
  return { root, commonGitDir };
}

async function validateBranch(
  runtime: WorktreeRuntime,
  repositoryRoot: string,
  branch: string,
  signal?: AbortSignal,
): Promise<string> {
  const value = validatedRef(branch, "branch");
  await runtime.git(repositoryRoot, ["check-ref-format", "--branch", value], signal);
  return value;
}

async function resolveCommit(
  runtime: WorktreeRuntime,
  repositoryRoot: string,
  ref: string,
  signal?: AbortSignal,
): Promise<string> {
  const value = validatedRef(ref, "startPoint");
  return (
    await runtime.git(repositoryRoot, ["rev-parse", "--verify", `${value}^{commit}`], signal)
  ).trim();
}

function repositoryName(root: string): string {
  const value = basename(root);
  if (value === "" || value === "." || value === ".." || basename(value) !== value) {
    throw new Error(`cannot derive a safe repository name from ${root}`);
  }
  return value;
}

async function cleanupFailedDestination(
  runtime: WorktreeRuntime,
  baseDir: string,
  repositoryRoot: string,
  parent: string,
  destination: string,
  signal?: AbortSignal,
): Promise<void> {
  let registered: boolean;
  try {
    registered = parseWorktreePorcelain(await runtime.git(repositoryRoot, ["worktree", "list", "--porcelain", "-z"], signal)).some(
      (record) => resolve(record.path) === resolve(destination),
    );
  } catch {
    // If Git cannot establish the registration truth, retain the generated path.
    // Deleting an uncertain partial worktree would turn a recoverable failure into data loss.
    return;
  }
  if (!registered) await runtime.removeGeneratedParent(baseDir, parent, signal);
}

export async function createWorktree(
  options: CreateWorktreeOptions,
): Promise<CreateWorktreeResult> {
  const runtime = options.runtime ?? standaloneRuntime();
  const repository = await resolveRepository(runtime, options.repository, options.signal);
  const baseDir = await runtime.ensureDirectory(options.baseDir, options.signal);
  const sourceDirty =
    (await runtime.git(
      repository.root,
      ["status", "--porcelain=v1", "--untracked-files=normal"],
      options.signal,
    )).length > 0;

  const worktreeId = options.worktreeId ?? randomUUID();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(worktreeId)) {
    throw new Error("worktreeId must contain only letters, digits, underscore, or hyphen");
  }
  const parent = join(baseDir, worktreeId);
  const destination = join(parent, repositoryName(repository.root));
  assertPathInside(baseDir, parent);
  assertPathInside(baseDir, destination);
  await runtime.mkdir(parent, options.signal);

  let branch: string | undefined;
  let addArgs: string[];
  try {
    if (options.target.type === "new-branch") {
      branch = await validateBranch(runtime, repository.root, options.target.branch, options.signal);
      const commit = await resolveCommit(
        runtime, repository.root,
        options.target.startPoint ?? "HEAD",
        options.signal,
      );
      addArgs = ["worktree", "add", "-b", branch, destination, commit];
    } else if (options.target.type === "existing-branch") {
      branch = await validateBranch(runtime, repository.root, options.target.branch, options.signal);
      await resolveCommit(runtime, repository.root, `refs/heads/${branch}`, options.signal);
      addArgs = ["worktree", "add", destination, branch];
    } else {
      const commit = await resolveCommit(
        runtime, repository.root,
        options.target.startPoint ?? "HEAD",
        options.signal,
      );
      addArgs = ["worktree", "add", "--detach", destination, commit];
    }
    await runtime.git(repository.root, addArgs, options.signal);
  } catch (error) {
    await cleanupFailedDestination(runtime, baseDir, repository.root, parent, destination, options.signal);
    throw error;
  }

  const path = await runtime.realpath(destination, options.signal);
  assertPathInside(baseDir, path);
  if (dirname(path) !== parent) {
    throw new Error(`created worktree resolved outside its generated parent: ${path}`);
  }
  const headCommit = (await runtime.git(path, ["rev-parse", "HEAD"], options.signal)).trim();
  return {
    worktreeId,
    path,
    repositoryRoot: repository.root,
    commonGitDir: repository.commonGitDir,
    mode: options.target.type,
    ...(branch === undefined ? {} : { branch }),
    headCommit,
    sourceDirty,
    next: { cwd: path },
  };
}
