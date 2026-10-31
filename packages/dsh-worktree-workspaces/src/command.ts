import { basename } from "node:path";

import type { Context } from "@deepseek-ai/cordis";
import type { CommandDefinition, CommandInvocation } from "@deepseek-ai/dsh-commands";
import type {} from "@deepseek-ai/dsh-workspace";

import { createWorktree } from "./create-worktree.js";
import { parseWorktreePorcelain } from "./git.js";
import { hostRuntime } from "./host-runtime.js";
import { isPathInside } from "./paths.js";
import { defaultWorktreeBranch, managedWorkspaceTitle, LOCATION_RECEIPT_PREFIX, WORKSPACE_RECEIPT_PREFIX } from "./protocol.js";
import type { WorktreeRuntime } from "./runtime.js";

export interface WorktreeCommandConfig {
  baseDir: string;
  execution(invocation: CommandInvocation): Promise<WorktreeRuntime>;
  registerWorkspace(path: string, title: string): Promise<{ id: string; path: string; title: string }>;
}

interface ParsedWorktreeCommand { action: "status" | "new"; branch?: string }
const USAGE = "用法：/worktree [status | new [可选分支]]";

function parseInput(rawInput: string): ParsedWorktreeCommand {
  const input = rawInput.trim();
  if (input === "" || input === "status") return { action: "status" };
  const parts = input.split(/\s+/);
  if (parts[0] !== "new" || parts.length > 2) throw new Error(USAGE);
  return parts[1] === undefined ? { action: "new" } : { action: "new", branch: parts[1] };
}

function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error); }

interface ExistingManagedWorktree { path: string; repositoryRoot: string }

async function findExistingManagedWorktree(
  runtime: WorktreeRuntime, branch: string, baseDir: string, signal: AbortSignal,
): Promise<ExistingManagedWorktree | undefined> {
  const repositoryRoot = (await runtime.git(runtime.cwd, ["rev-parse", "--show-toplevel"], signal)).trim();
  const record = parseWorktreePorcelain(await runtime.git(repositoryRoot, ["worktree", "list", "--porcelain", "-z"], signal))
    .find((candidate) => candidate.branch === `refs/heads/${branch}`);
  if (record === undefined) return undefined;
  const base = await runtime.ensureDirectory(baseDir, signal);
  const path = await runtime.realpath(record.path, signal);
  if (!isPathInside(base, path)) throw new Error(`分支 ${branch} 已在插件管理目录之外检出：${path}`);
  return { path, repositoryRoot };
}

async function status(runtime: WorktreeRuntime, signal: AbortSignal) {
  const repositoryRoot = await runtime.realpath((await runtime.git(runtime.cwd, ["rev-parse", "--show-toplevel"], signal)).trim(), signal);
  const branch = (await runtime.git(runtime.cwd, ["branch", "--show-current"], signal)).trim();
  const worktrees = parseWorktreePorcelain(await runtime.git(repositoryRoot, ["worktree", "list", "--porcelain", "-z"], signal));
  const main = worktrees[0];
  if (main === undefined) throw new Error("Git 未返回主工作区。");
  const mainPath = await runtime.realpath(main.path, signal);
  return {
    kind: "success" as const,
    text: [
      `仓库：${repositoryRoot}`, `当前位置：${runtime.cwd}`, `分支：${branch === "" ? "detached HEAD" : branch}`,
      `Git worktree：${worktrees.length} 个`, USAGE,
      LOCATION_RECEIPT_PREFIX + JSON.stringify({ repositoryRoot, mainPath, branch }),
    ].join("\n"),
  };
}

export function createWorktreeCommand(config: WorktreeCommandConfig): CommandDefinition {
  return {
    name: "worktree",
    description: "创建 Git worktree 并注册为 DSH Workspace",
    input: { hint: "status | new [可选分支]" },
    async handler(invocation) {
      let parsed: ParsedWorktreeCommand;
      try { parsed = parseInput(invocation.rawInput); }
      catch (error) { return { kind: "error", text: messageOf(error) }; }
      let runtime: WorktreeRuntime;
      try { runtime = await config.execution(invocation); }
      catch (error) {
        if (invocation.signal.aborted) throw error;
        return { kind: "error", text: `定位当前 Git 仓库失败：${messageOf(error)}` };
      }
      if (parsed.action === "status") {
        try { return await status(runtime, invocation.signal); }
        catch (error) {
          if (invocation.signal.aborted) throw error;
          return { kind: "error", text: `读取 Git worktree 状态失败：${messageOf(error)}` };
        }
      }
      const branch = parsed.branch ?? defaultWorktreeBranch(String(invocation.agent.session.header.id));
      let existing: ExistingManagedWorktree | undefined;
      try { existing = await findExistingManagedWorktree(runtime, branch, config.baseDir, invocation.signal); }
      catch (error) {
        if (invocation.signal.aborted) throw error;
        return { kind: "error", text: `检查已有 Git worktree 失败：${messageOf(error)}` };
      }
      let result;
      if (existing === undefined) {
        try {
          result = await createWorktree({ repository: runtime.cwd, target: { type: "new-branch", branch }, baseDir: config.baseDir, signal: invocation.signal, runtime });
        } catch (error) {
          if (invocation.signal.aborted) throw error;
          try { existing = await findExistingManagedWorktree(runtime, branch, config.baseDir, invocation.signal); }
          catch { /* Preserve the authoritative create failure, never hide it with a probe failure. */ }
          if (existing === undefined) return { kind: "error", text: `创建 Git worktree 失败：${messageOf(error)}` };
        }
      }
      const path = existing?.path ?? result!.path;
      const repositoryRoot = existing?.repositoryRoot ?? result!.repositoryRoot;
      let workspace;
      try {
        invocation.signal.throwIfAborted();
        workspace = await config.registerWorkspace(path, managedWorkspaceTitle(basename(repositoryRoot), branch));
        if (workspace.path !== path) throw new Error("Workspace 注册返回了不匹配的规范路径。");
      } catch (error) {
        if (invocation.signal.aborted) throw error;
        return { kind: "error", text: `Git worktree 已就绪，但注册 DSH Workspace 失败：${messageOf(error)}\n工作树路径：${path}` };
      }
      const warning = result?.sourceDirty === true ? "\n提示：源仓库有未提交改动，这些改动没有复制到新工作树。" : "";
      return {
        kind: "success",
        text: `${existing === undefined ? "已创建" : "已复用"} Git worktree 并注册 Workspace。\n分支：${branch}\n路径：${path}\nWorkspace：${workspace.title}${warning}\n` +
          WORKSPACE_RECEIPT_PREFIX + JSON.stringify({ workspaceId: String(workspace.id), path: workspace.path }),
      };
    },
  };
}

export function registerWorktreeCommand(ctx: Context, config: { baseDir: string }): void {
  ctx.commands.register(createWorktreeCommand({
    baseDir: config.baseDir,
    execution: (invocation) => hostRuntime(ctx, invocation),
    registerWorkspace: (path, title) => ctx.workspaceRegistry.create(path, title),
  }));
}
