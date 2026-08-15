import { realpath } from "node:fs/promises";
import { basename } from "node:path";

import type { CommandDefinition, CommandInvocation } from "@deepseek-ai/dsh-commands";
import type {} from "@deepseek-ai/dsh-workspace";

import { createWorktree } from "./create-worktree.js";
import { listGitWorktrees, runGit } from "./git.js";
import { ensureCanonicalDirectory, isPathInside } from "./paths.js";
import { defaultWorktreeBranch, managedWorkspaceTitle } from "./protocol.js";

export interface WorktreeCommandConfig {
  baseDir: string;
  registerWorkspace(path: string, title: string): Promise<unknown>;
}

interface ParsedWorktreeCommand {
  action: "status" | "new";
  branch?: string;
}

const USAGE = "用法：/worktree [status | new [branch]]";

function parseInput(rawInput: string): ParsedWorktreeCommand {
  const input = rawInput.trim();
  if (input === "" || input === "status") return { action: "status" };

  const parts = input.split(/\s+/);
  if (parts[0] !== "new" || parts.length > 2) throw new Error(USAGE);
  return parts[1] === undefined
    ? { action: "new" }
    : { action: "new", branch: parts[1] };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ExistingManagedWorktree {
  path: string;
  repositoryRoot: string;
}

async function findExistingManagedWorktree(
  cwd: string,
  branch: string,
  baseDir: string,
  signal: AbortSignal,
): Promise<ExistingManagedWorktree | undefined> {
  const repositoryRoot = (
    await runGit(cwd, ["rev-parse", "--show-toplevel"], signal)
  ).trim();
  const record = (await listGitWorktrees(repositoryRoot, signal)).find(
    (candidate) => candidate.branch === `refs/heads/${branch}`,
  );
  if (record === undefined) return undefined;

  const base = await ensureCanonicalDirectory(baseDir);
  const path = await realpath(record.path);
  if (!isPathInside(base, path)) {
    throw new Error(`分支 ${branch} 已在插件管理目录之外检出：${path}`);
  }
  return { path, repositoryRoot };
}

async function status(invocation: CommandInvocation, cwd: string) {
  const repositoryRoot = (
    await runGit(cwd, ["rev-parse", "--show-toplevel"], invocation.signal)
  ).trim();
  const branch = (
    await runGit(cwd, ["branch", "--show-current"], invocation.signal)
  ).trim();
  const worktrees = await listGitWorktrees(repositoryRoot, invocation.signal);
  return {
    kind: "success" as const,
    text: [
      `仓库：${repositoryRoot}`,
      `当前位置：${cwd}`,
      `分支：${branch === "" ? "detached HEAD" : branch}`,
      `Git worktree：${worktrees.length} 个`,
      USAGE,
    ].join("\n"),
  };
}

export function createWorktreeCommand(config: WorktreeCommandConfig): CommandDefinition {
  return {
    name: "worktree",
    description: "创建 Git worktree 并注册为 DSH Workspace",
    input: { hint: "status | new [branch]" },
    async handler(invocation) {
      const cwd = invocation.agent.session.header.cwd;
      if (cwd === undefined) {
        return { kind: "error", text: "当前会话没有 cwd，无法定位 Git 仓库。" };
      }

      let parsed: ParsedWorktreeCommand;
      try {
        parsed = parseInput(invocation.rawInput);
      } catch (error) {
        return { kind: "error", text: messageOf(error) };
      }

      if (parsed.action === "status") {
        try {
          return await status(invocation, cwd);
        } catch (error) {
          if (invocation.signal.aborted) throw error;
          return { kind: "error", text: `读取 Git worktree 状态失败：${messageOf(error)}` };
        }
      }

      const branch = parsed.branch ?? defaultWorktreeBranch(String(invocation.agent.session.header.id));
      let existing: ExistingManagedWorktree | undefined;
      try {
        existing = await findExistingManagedWorktree(
          cwd,
          branch,
          config.baseDir,
          invocation.signal,
        );
      } catch (error) {
        if (invocation.signal.aborted) throw error;
        return { kind: "error", text: `检查已有 Git worktree 失败：${messageOf(error)}` };
      }

      let result;
      if (existing === undefined) {
        try {
          result = await createWorktree({
            repository: cwd,
            target: { type: "new-branch", branch },
            baseDir: config.baseDir,
            signal: invocation.signal,
          });
        } catch (error) {
          if (invocation.signal.aborted) throw error;
          try {
            existing = await findExistingManagedWorktree(
              cwd,
              branch,
              config.baseDir,
              invocation.signal,
            );
          } catch {
            // Keep the original create error: it is the authoritative failure for this attempt.
          }
          if (existing === undefined) {
            return { kind: "error", text: `创建 Git worktree 失败：${messageOf(error)}` };
          }
        }
      }

      const path = existing?.path ?? result!.path;
      const repositoryRoot = existing?.repositoryRoot ?? result!.repositoryRoot;
      const workspaceTitle = managedWorkspaceTitle(basename(repositoryRoot), branch);
      try {
        await config.registerWorkspace(path, workspaceTitle);
      } catch (error) {
        if (invocation.signal.aborted) throw error;
        return {
          kind: "error",
          text:
            `Git worktree 已就绪，但注册 DSH Workspace 失败：${messageOf(error)}\n` +
            `工作树路径：${path}`,
        };
      }

      const warning = result?.sourceDirty === true
        ? "\n提示：源仓库有未提交改动，这些改动没有复制到新工作树。"
        : "";
      return {
        kind: "success",
        text:
          `${existing === undefined ? "已创建" : "已复用"} Git worktree 并注册 Workspace。\n` +
          `分支：${branch}\n` +
          `路径：${path}\n` +
          `Workspace：${workspaceTitle}${warning}`,
      };
    },
  };
}

export function registerWorktreeCommand(
  ctx: import("@deepseek-ai/cordis").Context,
  config: { baseDir: string },
): void {
  ctx.commands.register(
    createWorktreeCommand({
      baseDir: config.baseDir,
      registerWorkspace: (path, title) => ctx.workspaceRegistry.create(path, title),
    }),
  );
}
