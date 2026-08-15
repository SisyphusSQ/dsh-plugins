export const WORKTREE_WORKSPACE_SEPARATOR = " · ";

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
