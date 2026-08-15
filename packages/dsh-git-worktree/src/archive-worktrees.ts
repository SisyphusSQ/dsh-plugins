import { basename, dirname, join, resolve } from "node:path";
import { lstat, mkdir, readdir, realpath, rmdir, writeFile } from "node:fs/promises";

import { listGitWorktrees, runGit, type GitWorktreeRecord } from "./git.js";
import { assertPathInside, expandHome, isPathInside } from "./paths.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function throwIfAborted(signal?: AbortSignal, fallback?: unknown): void {
  if (signal?.aborted === true) {
    throw signal.reason ?? fallback ?? new Error("archive operation was aborted");
  }
}

export type ArchiveStatus =
  | "eligible"
  | "too-new"
  | "locked"
  | "not-linked-worktree"
  | "invalid-layout"
  | "moved"
  | "failed";

export interface ArchiveRecord {
  worktreeId: string;
  sourcePath: string;
  targetPath?: string;
  commonGitDir?: string;
  branch?: string;
  head?: string;
  dirty?: boolean;
  ageDays?: number;
  status: ArchiveStatus;
  reason?: string;
  executedAt: string;
}

export interface ArchiveWorktreesOptions {
  baseDir: string;
  archiveDir: string;
  days: number;
  apply: boolean;
  signal?: AbortSignal;
  now?: Date;
}

export interface ArchiveWorktreesResult {
  apply: boolean;
  days: number;
  manifestPath?: string;
  records: ArchiveRecord[];
}

function archiveStamp(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, "");
}

function branchName(record: GitWorktreeRecord): string | undefined {
  const prefix = "refs/heads/";
  if (record.branch?.startsWith(prefix) === true) return record.branch.slice(prefix.length);
  return record.branch;
}

async function candidatePaths(baseDir: string): Promise<Array<{ id: string; path: string }>> {
  const candidates: Array<{ id: string; path: string }> = [];
  for (const idEntry of await readdir(baseDir, { withFileTypes: true })) {
    if (!idEntry.isDirectory() || idEntry.isSymbolicLink()) continue;
    const idPath = join(baseDir, idEntry.name);
    for (const repoEntry of await readdir(idPath, { withFileTypes: true })) {
      if (!repoEntry.isDirectory() || repoEntry.isSymbolicLink()) continue;
      candidates.push({ id: idEntry.name, path: join(idPath, repoEntry.name) });
    }
  }
  return candidates;
}

async function inspectCandidate(
  baseDir: string,
  archiveRunDir: string,
  candidate: { id: string; path: string },
  thresholdMs: number,
  now: Date,
  signal?: AbortSignal,
): Promise<ArchiveRecord> {
  const executedAt = now.toISOString();
  let sourcePath: string;
  try {
    sourcePath = await realpath(candidate.path);
  } catch (error) {
    throwIfAborted(signal, error);
    return {
      worktreeId: candidate.id,
      sourcePath: candidate.path,
      status: "invalid-layout",
      reason: String(error),
      executedAt,
    };
  }
  if (!isPathInside(baseDir, sourcePath) || basename(dirname(sourcePath)) !== candidate.id) {
    return {
      worktreeId: candidate.id,
      sourcePath,
      status: "invalid-layout",
      reason: "candidate does not match <baseDir>/<worktreeId>/<repoName>",
      executedAt,
    };
  }

  try {
    const topLevel = await realpath(
      (await runGit(sourcePath, ["rev-parse", "--show-toplevel"], signal)).trim(),
    );
    const gitDir = await realpath((
      await runGit(sourcePath, ["rev-parse", "--path-format=absolute", "--git-dir"], signal)
    ).trim());
    const commonGitDir = await realpath(
      (await runGit(
        sourcePath,
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        signal,
      )).trim(),
    );
    if (topLevel !== sourcePath || gitDir === commonGitDir) {
      return {
        worktreeId: candidate.id,
        sourcePath,
        commonGitDir,
        status: "not-linked-worktree",
        reason: "candidate is not the root of a linked worktree",
        executedAt,
      };
    }

    const listed = (await listGitWorktrees(sourcePath, signal)).find(
      (record) => resolve(record.path) === resolve(sourcePath),
    );
    if (listed === undefined) {
      return {
        worktreeId: candidate.id,
        sourcePath,
        commonGitDir,
        status: "not-linked-worktree",
        reason: "candidate is absent from git worktree list",
        executedAt,
      };
    }
    const stat = await lstat(sourcePath);
    const ageMs = Math.max(0, now.getTime() - stat.mtimeMs);
    const ageDays = ageMs / DAY_MS;
    const dirty =
      (await runGit(
        sourcePath,
        ["status", "--porcelain=v1", "--untracked-files=normal"],
        signal,
      )).length > 0;
    const targetPath = join(archiveRunDir, candidate.id, basename(sourcePath));
    const branch = branchName(listed);
    const head = listed.head;
    if (listed.locked) {
      return {
        worktreeId: candidate.id,
        sourcePath,
        targetPath,
        commonGitDir,
        ...(branch === undefined ? {} : { branch }),
        ...(head === undefined ? {} : { head }),
        dirty,
        ageDays,
        status: "locked",
        reason: listed.lockReason ?? "worktree is locked",
        executedAt,
      };
    }
    return {
      worktreeId: candidate.id,
      sourcePath,
      targetPath,
      commonGitDir,
      ...(branch === undefined ? {} : { branch }),
      ...(head === undefined ? {} : { head }),
      dirty,
      ageDays,
      status: ageMs >= thresholdMs ? "eligible" : "too-new",
      executedAt,
    };
  } catch (error) {
    return {
      worktreeId: candidate.id,
      sourcePath,
      status: "not-linked-worktree",
      reason: String(error),
      executedAt,
    };
  }
}

export async function archiveWorktrees(
  options: ArchiveWorktreesOptions,
): Promise<ArchiveWorktreesResult> {
  throwIfAborted(options.signal);
  if (!Number.isFinite(options.days) || options.days < 0) {
    throw new Error("days must be a non-negative finite number");
  }
  const now = options.now ?? new Date();
  const baseInput = expandHome(options.baseDir);
  let baseDir: string;
  try {
    baseDir = await realpath(baseInput);
  } catch (error) {
    const missing = error as NodeJS.ErrnoException;
    if (missing.code === "ENOENT") return { apply: options.apply, days: options.days, records: [] };
    throw error;
  }

  const archiveRoot = expandHome(options.archiveDir);
  const archiveRunDir = join(archiveRoot, archiveStamp(now));
  const thresholdMs = options.days * DAY_MS;
  const records: ArchiveRecord[] = [];
  for (const candidate of await candidatePaths(baseDir)) {
    throwIfAborted(options.signal);
    records.push(
      await inspectCandidate(baseDir, archiveRunDir, candidate, thresholdMs, now, options.signal),
    );
  }

  if (!options.apply) return { apply: false, days: options.days, records };
  const eligible = records.filter((record) => record.status === "eligible");
  if (eligible.length === 0) return { apply: true, days: options.days, records };

  await mkdir(archiveRunDir, { recursive: true });
  for (const record of eligible) {
    throwIfAborted(options.signal);
    const targetPath = record.targetPath;
    if (targetPath === undefined) {
      record.status = "failed";
      record.reason = "eligible record has no target path";
      continue;
    }
    assertPathInside(archiveRunDir, targetPath);
    const targetParent = dirname(targetPath);
    await mkdir(targetParent, { recursive: true });
    try {
      await runGit(
        record.sourcePath,
        ["worktree", "move", record.sourcePath, targetPath],
        options.signal,
      );
      record.targetPath = await realpath(targetPath);
      record.status = "moved";
    } catch (error) {
      throwIfAborted(options.signal, error);
      record.status = "failed";
      record.reason = String(error);
      await rmdir(targetParent).catch(() => undefined);
    }
  }

  const manifestPath = join(archiveRunDir, "manifest.jsonl");
  await writeFile(
    manifestPath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  return { apply: true, days: options.days, manifestPath, records };
}
