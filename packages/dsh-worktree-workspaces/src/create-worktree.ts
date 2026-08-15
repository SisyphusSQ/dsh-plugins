import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { mkdir, realpath, rm } from "node:fs/promises";

import { listGitWorktrees, runGit } from "./git.js";
import { assertPathInside, ensureCanonicalDirectory } from "./paths.js";

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
  input: string,
  signal?: AbortSignal,
): Promise<RepositoryIdentity> {
  const candidate = resolve(input);
  const rootText = await runGit(candidate, ["rev-parse", "--show-toplevel"], signal);
  const root = await realpath(rootText.trim());
  const commonText = await runGit(
    root,
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    signal,
  );
  const commonCandidate = commonText.trim();
  const commonGitDir = await realpath(
    isAbsolute(commonCandidate) ? commonCandidate : resolve(root, commonCandidate),
  );
  return { root, commonGitDir };
}

async function validateBranch(
  repositoryRoot: string,
  branch: string,
  signal?: AbortSignal,
): Promise<string> {
  const value = validatedRef(branch, "branch");
  await runGit(repositoryRoot, ["check-ref-format", "--branch", value], signal);
  return value;
}

async function resolveCommit(
  repositoryRoot: string,
  ref: string,
  signal?: AbortSignal,
): Promise<string> {
  const value = validatedRef(ref, "startPoint");
  return (
    await runGit(repositoryRoot, ["rev-parse", "--verify", `${value}^{commit}`], signal)
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
  repositoryRoot: string,
  parent: string,
  destination: string,
  signal?: AbortSignal,
): Promise<void> {
  let registered: boolean;
  try {
    registered = (await listGitWorktrees(repositoryRoot, signal)).some(
      (record) => resolve(record.path) === resolve(destination),
    );
  } catch {
    // If Git cannot establish the registration truth, retain the generated path.
    // Deleting an uncertain partial worktree would turn a recoverable failure into data loss.
    return;
  }
  if (!registered) await rm(parent, { recursive: true, force: true });
}

export async function createWorktree(
  options: CreateWorktreeOptions,
): Promise<CreateWorktreeResult> {
  const repository = await resolveRepository(options.repository, options.signal);
  const baseDir = await ensureCanonicalDirectory(options.baseDir);
  const sourceDirty =
    (await runGit(
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
  await mkdir(parent);

  let branch: string | undefined;
  let addArgs: string[];
  try {
    if (options.target.type === "new-branch") {
      branch = await validateBranch(repository.root, options.target.branch, options.signal);
      const commit = await resolveCommit(
        repository.root,
        options.target.startPoint ?? "HEAD",
        options.signal,
      );
      addArgs = ["worktree", "add", "-b", branch, destination, commit];
    } else if (options.target.type === "existing-branch") {
      branch = await validateBranch(repository.root, options.target.branch, options.signal);
      await resolveCommit(repository.root, `refs/heads/${branch}`, options.signal);
      addArgs = ["worktree", "add", destination, branch];
    } else {
      const commit = await resolveCommit(
        repository.root,
        options.target.startPoint ?? "HEAD",
        options.signal,
      );
      addArgs = ["worktree", "add", "--detach", destination, commit];
    }
    await runGit(repository.root, addArgs, options.signal);
  } catch (error) {
    await cleanupFailedDestination(repository.root, parent, destination, options.signal);
    throw error;
  }

  const path = await realpath(destination);
  assertPathInside(baseDir, path);
  if (dirname(path) !== parent) {
    throw new Error(`created worktree resolved outside its generated parent: ${path}`);
  }
  const headCommit = (await runGit(path, ["rev-parse", "HEAD"], options.signal)).trim();
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
