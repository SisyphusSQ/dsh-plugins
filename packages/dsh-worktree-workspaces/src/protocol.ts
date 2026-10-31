export const WORKTREE_WORKSPACE_SEPARATOR = " · ";

/** Versioned command receipt, separate from mutable user-facing titles. */
export const WORKSPACE_RECEIPT_PREFIX = "DSH_WORKTREE_WORKSPACE_V1 ";
export const LOCATION_RECEIPT_PREFIX = "DSH_WORKTREE_LOCATION_V1 ";

export interface WorkspaceReceipt {
  workspaceId: string;
  /** Canonical absolute process path returned by the Host registry. */
  path: string;
}

export interface WorktreeLocation {
  repositoryRoot: string;
  mainPath: string;
  branch: string;
}

function receipt(text: string | undefined, prefix: string): unknown {
  const line = text?.split("\n").at(-1);
  if (line === undefined || !line.startsWith(prefix)) throw new Error("Host 未返回受支持的 worktree 回执。");
  return JSON.parse(line.slice(prefix.length));
}

export function workspaceReceipt(text: string | undefined): WorkspaceReceipt {
  const value = receipt(text, WORKSPACE_RECEIPT_PREFIX) as Partial<WorkspaceReceipt> | null;
  if (value === null || typeof value.workspaceId !== "string" || value.workspaceId === "" || typeof value.path !== "string" || value.path === "") {
    throw new Error("Host 返回了无效的 Workspace 回执。");
  }
  return { workspaceId: value.workspaceId, path: value.path };
}

export function worktreeLocation(text: string | undefined): WorktreeLocation {
  const value = receipt(text, LOCATION_RECEIPT_PREFIX) as Partial<WorktreeLocation> | null;
  if (value === null || typeof value.repositoryRoot !== "string" || typeof value.mainPath !== "string" || typeof value.branch !== "string") {
    throw new Error("Host 返回了无效的 worktree 位置回执。");
  }
  return { repositoryRoot: value.repositoryRoot, mainPath: value.mainPath, branch: value.branch };
}

function safeSessionSlug(sessionId: string): string {
  const slug = sessionId
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug === "") throw new Error("sessionId cannot produce a Git branch name");
  return slug;
}

export function defaultWorktreeBranch(sessionId: string): string {
  return `dsh/${safeSessionSlug(sessionId)}`;
}

export function managedWorkspaceTitle(repositoryName: string, branch: string): string {
  return `${repositoryName}${WORKTREE_WORKSPACE_SEPARATOR}${branch}`;
}

export interface ManagedWorkspaceTitle {
  repositoryName: string;
  branch: string;
}

export function parseManagedWorkspaceTitle(title: string): ManagedWorkspaceTitle | undefined {
  const separator = title.indexOf(WORKTREE_WORKSPACE_SEPARATOR);
  if (separator <= 0) return undefined;
  const repositoryName = title.slice(0, separator);
  const branch = title.slice(separator + WORKTREE_WORKSPACE_SEPARATOR.length);
  if (branch === "") return undefined;
  return { repositoryName, branch };
}
