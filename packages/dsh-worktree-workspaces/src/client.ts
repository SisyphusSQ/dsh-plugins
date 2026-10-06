import type { Context as ClientContext } from "@deepseek-ai/cordis";
// 0.2 split what 0.1's `dsh-client-runtime` barrel owned: the Workspace row
// vocabulary and the Client Workspace service now belong to the Workspace
// Controller, and Workspace navigation to the Workspace UI capability.
import type {} from "@deepseek-ai/dsh-api-workspace-controller/client";
import type { WorkspaceView } from "@deepseek-ai/dsh-api-workspace-controller/types";
import type {} from "@deepseek-ai/dsh-client-ui-workspace/client";
import type {
  CommandDecoration,
  SelectOption,
} from "@deepseek-ai/dsh-client-ui-commands/client";

import {
  defaultWorktreeBranch,
  managedWorkspaceTitle,
  parseManagedWorkspaceTitle,
} from "./protocol.js";

export { defaultWorktreeBranch, managedWorkspaceTitle };

export const name = "worktree-workspaces";
export const inject = ["workspaces", "remote", "remote.commands", "commandUi", "uiWorkspace"];

const WORKSPACE_WAIT_MS = 10_000;

/**
 * The observable Workspace-list read face this module consumes. 0.1 spelled it
 * `ObservableSnapshot<{ items }>` from the removed `dsh-client-runtime`; the
 * 0.2 owner exposes it as `IWorkspaces['list']`, and this structural shape is
 * exactly the part used here.
 */
export interface WorkspaceListSource {
  getSnapshot(): { readonly items: readonly WorkspaceView[] };
  subscribe(listener: () => void): () => void;
}

function pathBasename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const separator = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return normalized.slice(separator + 1);
}

function currentWorkspace(
  items: readonly WorkspaceView[],
  sessionId: string,
): WorkspaceView | undefined {
  return items.find((item) => item.sessionIds.some((id) => String(id) === sessionId));
}

function localWorkspace(
  items: readonly WorkspaceView[],
  current: WorkspaceView,
  repositoryName: string,
): WorkspaceView | undefined {
  if (parseManagedWorkspaceTitle(current.title) === undefined) return current;
  return items.find(
    (item) =>
      item.workspaceId !== current.workspaceId &&
      pathBasename(item.path) === repositoryName &&
      parseManagedWorkspaceTitle(item.title) === undefined,
  );
}

export function worktreeOptions(
  items: readonly WorkspaceView[],
  sessionId: string,
): readonly SelectOption[] {
  const current = currentWorkspace(items, sessionId);
  if (current === undefined) return [];

  const repositoryName = pathBasename(current.path);
  const managed = parseManagedWorkspaceTitle(current.title);
  const local = localWorkspace(items, current, repositoryName);
  const branch = defaultWorktreeBranch(sessionId);
  const options: SelectOption[] = [];

  if (local !== undefined) {
    options.push({
      id: `local:${String(local.workspaceId)}`,
      label: `本地 · ${repositoryName}`,
      detail: local.path,
      active: local.workspaceId === current.workspaceId,
    });
  }
  if (managed !== undefined) {
    options.push({
      id: "current",
      label: `工作树 · ${managed.repositoryName}`,
      detail: managed.branch,
      active: true,
    });
  }
  options.push({
    id: "new",
    label: `新建工作树 · ${repositoryName}`,
    detail: branch,
    confirmation: {
      title: "新建 Git 工作树？",
      description: `将从当前 HEAD 创建分支 ${branch}。未提交改动不会复制。`,
      acknowledgeLabel: "我了解会创建分支和目录",
      cancelLabel: "取消",
      confirmLabel: "创建并切换",
    },
  });
  return options;
}

export async function waitForWorkspace(
  source: WorkspaceListSource,
  title: string,
  timeoutMs = WORKSPACE_WAIT_MS,
): Promise<WorkspaceView> {
  const find = (): WorkspaceView | undefined =>
    source.getSnapshot().items.find((item) => item.title === title);
  const immediate = find();
  if (immediate !== undefined) return immediate;

  return new Promise<WorkspaceView>((resolve, reject) => {
    let settled = false;
    let unsubscribe = (): void => {};
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      reject(new Error(`DSH Workspace 未在 ${timeoutMs}ms 内出现：${title}`));
    }, timeoutMs);

    const check = (): void => {
      if (settled) return;
      const workspace = find();
      if (workspace === undefined) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(workspace);
    };
    unsubscribe = source.subscribe(check);
    check();
  });
}

// 0.2: connecting a Workspace to its reusable-or-new blank Session and showing
// that Session became one navigation action owned by the Workspace UI
// capability; `ctx.workspaces.connectWorkspace` and `ctx.sessions.open` are gone.
async function openWorkspace(ctx: ClientContext, workspace: WorkspaceView): Promise<void> {
  await ctx.uiWorkspace.openWorkspace(workspace.workspaceId);
}

function remoteFailure(error: { code: string; message: string }): string {
  return `${error.code}: ${error.message}`;
}

export function createWorktreeDecoration(ctx: ClientContext): CommandDecoration {
  return {
    name: "worktree",
    available(session) {
      return currentWorkspace(ctx.workspaces.list.getSnapshot().items, String(session.sessionId)) !== undefined;
    },
    ui: {
      kind: "popupSelect",
      async options(session) {
        return worktreeOptions(
          ctx.workspaces.list.getSnapshot().items,
          String(session.sessionId),
        );
      },
      async onSelect(option, session) {
        if (option.id === "current") return;

        if (option.id.startsWith("local:")) {
          const workspaceId = option.id.slice("local:".length);
          const workspace = ctx.workspaces.list
            .getSnapshot()
            .items.find((item) => String(item.workspaceId) === workspaceId);
          if (workspace === undefined) throw new Error("本地 Workspace 已不存在，请重新打开菜单。");
          await openWorkspace(ctx, workspace);
          return;
        }

        if (option.id !== "new") throw new Error(`未知的 worktree 选项：${option.id}`);
        const current = currentWorkspace(
          ctx.workspaces.list.getSnapshot().items,
          String(session.sessionId),
        );
        if (current === undefined) throw new Error("当前会话不属于任何 DSH Workspace。");

        const repositoryName = pathBasename(current.path);
        const branch = defaultWorktreeBranch(String(session.sessionId));
        const execution = await ctx.remote.commands.execute(
          session.sessionId,
          `/worktree new ${branch}`,
          [],
        );
        if (!execution.ok) throw new Error(`执行 /worktree 失败：${remoteFailure(execution.error)}`);
        if (execution.value === undefined) throw new Error("当前 Host 没有注册 /worktree 命令。");
        if (execution.value.result.kind === "error") {
          throw new Error(execution.value.result.text);
        }

        const workspace = await waitForWorkspace(
          ctx.workspaces.list,
          managedWorkspaceTitle(repositoryName, branch),
        );
        await openWorkspace(ctx, workspace);
      },
    },
  };
}

export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.commandUi.decorate(createWorktreeDecoration(ctx)),
    "dsh-worktree-workspaces: /worktree decoration",
  );
}
