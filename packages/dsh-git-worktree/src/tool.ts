import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";

import {
  createWorktree,
  type CreateWorktreeResult,
  type WorktreeTarget,
} from "./create-worktree.js";

export interface WorktreeToolConfig {
  baseDir: string;
}

interface ToolArguments {
  repository?: string;
  mode: WorktreeTarget["type"];
  branch?: string;
  startPoint?: string;
}

function targetFromArguments(args: ToolArguments): WorktreeTarget {
  if (args.mode === "new-branch") {
    if (args.branch === undefined) throw new Error("branch is required for new-branch mode");
    return {
      type: "new-branch",
      branch: args.branch,
      ...(args.startPoint === undefined ? {} : { startPoint: args.startPoint }),
    };
  }
  if (args.mode === "existing-branch") {
    if (args.branch === undefined) throw new Error("branch is required for existing-branch mode");
    if (args.startPoint !== undefined) {
      throw new Error("startPoint is not accepted for existing-branch mode");
    }
    return { type: "existing-branch", branch: args.branch };
  }
  if (args.branch !== undefined) throw new Error("branch is not accepted for detached mode");
  return {
    type: "detached",
    ...(args.startPoint === undefined ? {} : { startPoint: args.startPoint }),
  };
}

export function createWorktreeTool(config: WorktreeToolConfig) {
  return defineTool({
    name: "worktree_create",
    description:
      "Create a linked Git worktree under the configured DSH worktree directory. " +
      "This mutates the repository by adding a worktree and may create a branch. " +
      "It never copies uncommitted changes or creates a DSH session.",
    parameters: {
      repository: {
        type: "string",
        description: "Repository path or a directory inside it. Defaults to the current session cwd.",
      },
      mode: {
        type: "string",
        required: true,
        enum: ["new-branch", "existing-branch", "detached"],
        description: "Whether to create a branch, use an existing local branch, or detach HEAD.",
      },
      branch: {
        type: "string",
        description: "Required for new-branch and existing-branch; forbidden for detached.",
      },
      startPoint: {
        type: "string",
        description: "Commit-ish for new-branch or detached mode. Defaults to HEAD.",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          worktreeId: { type: "string", required: true },
          path: { type: "string", required: true },
          repositoryRoot: { type: "string", required: true },
          commonGitDir: { type: "string", required: true },
          mode: {
            type: "string",
            required: true,
            enum: ["new-branch", "existing-branch", "detached"],
          },
          branch: { type: "string" },
          headCommit: { type: "string", required: true },
          sourceDirty: { type: "boolean", required: true },
          next: {
            type: "object",
            required: true,
            additionalProperties: false,
            properties: { cwd: { type: "string", required: true } },
          },
        },
      },
      render(_args, value) {
        const result = value as unknown as CreateWorktreeResult;
        const warning = result.sourceDirty
          ? "\nWarning: source repository has uncommitted changes; they were not copied."
          : "";
        return [
          {
            type: "text",
            text:
              `Created Git worktree at ${String(result.path)}\n` +
              `HEAD: ${String(result.headCommit)}\n` +
              `Create the next DSH session with cwd=${String(result.next.cwd)}${warning}`,
          },
        ];
      },
    },
    timeoutMs: 120_000,
    async execute(args, exec) {
      const parsed = args as ToolArguments;
      const repository = parsed.repository ?? exec.agent?.session.header.cwd;
      if (repository === undefined) {
        throw new Error("repository is required when the tool call has no session cwd");
      }
      return createWorktree({
        repository,
        target: targetFromArguments(parsed),
        baseDir: config.baseDir,
        signal: exec.signal,
      });
    },
  });
}

export function registerWorktreeTool(ctx: Context, config: WorktreeToolConfig): void {
  ctx.tools.register(createWorktreeTool(config));
}
