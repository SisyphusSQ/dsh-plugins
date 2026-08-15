import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";

import { registerWorktreeCommand } from "./command.js";
import { DEFAULT_BASE_DIR } from "./paths.js";
import { registerWorktreeTool } from "./tool.js";

export { archiveWorktrees, type ArchiveWorktreesOptions } from "./archive-worktrees.js";
export {
  createWorktree,
  type CreateWorktreeOptions,
  type CreateWorktreeResult,
  type WorktreeTarget,
} from "./create-worktree.js";
export {
  defaultWorktreeBranch,
  managedWorkspaceTitle,
  parseManagedWorkspaceTitle,
} from "./protocol.js";

export const name = "git-worktree";
export const inject = ["tools", "commands", "workspaceRegistry"];

export interface Config {
  baseDir?: string;
}

export const Config = z.object({
  baseDir: z.string().default(DEFAULT_BASE_DIR),
});

export function apply(ctx: Context, config: Config = {}): void {
  const baseDir = config.baseDir ?? DEFAULT_BASE_DIR;
  registerWorktreeTool(ctx, { baseDir });
  registerWorktreeCommand(ctx, { baseDir });
}
