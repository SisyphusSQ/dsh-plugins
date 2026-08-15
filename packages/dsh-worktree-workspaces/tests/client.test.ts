import assert from "node:assert/strict";
import test from "node:test";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { WorkspaceView } from "@deepseek-ai/dsh-api-remotes/client";

import {
  createWorktreeDecoration,
  defaultWorktreeBranch,
  inject,
  managedWorkspaceTitle,
  worktreeOptions,
} from "../src/client.js";

function workspace(
  workspaceId: string,
  path: string,
  title: string,
  sessionIds: string[],
): WorkspaceView {
  return {
    workspaceId: workspaceId as WorkspaceView["workspaceId"],
    path,
    title,
    sessionIds: sessionIds as WorkspaceView["sessionIds"],
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
}

test("menu uses native rows for local, current worktree, and new worktree", () => {
  assert.deepEqual(inject, ["workspaces", "sessions", "remote", "remote.commands", "commandUi"]);
  const local = workspace("local", "/repo/fixture-repo", "fixture-repo", []);
  const managed = workspace(
    "managed",
    "/worktrees/id/fixture-repo",
    "fixture-repo · dsh/session-one",
    ["session-one"],
  );

  const options = worktreeOptions([local, managed], "session-one");
  assert.deepEqual(
    options.map(({ id, label, active }) => ({ id, label, active })),
    [
      { id: "local:local", label: "本地 · fixture-repo", active: false },
      { id: "current", label: "工作树 · fixture-repo", active: true },
      { id: "new", label: "新建工作树 · fixture-repo", active: undefined },
    ],
  );
});

test("new option executes host command, waits for Workspace, and opens its session", async () => {
  const sourceSessionId = "session-source";
  const local = workspace("local", "/repo/fixture-repo", "fixture-repo", [sourceSessionId]);
  let items: readonly WorkspaceView[] = [local];
  const listeners = new Set<() => void>();
  let executedLine = "";
  let connectedWorkspace = "";
  let openedSession = "";

  const ctx = {
    workspaces: {
      list: {
        getSnapshot: () => ({ items }),
        subscribe(listener: () => void) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      async connectWorkspace(workspaceId: string) {
        connectedWorkspace = workspaceId;
        return "new-session";
      },
    },
    sessions: {
      open(sessionId: string) {
        openedSession = sessionId;
      },
    },
    remote: {
      commands: {
        async execute(_sessionId: string, line: string) {
          executedLine = line;
          const branch = defaultWorktreeBranch(sourceSessionId);
          items = [
            workspace(
              "managed",
              "/worktrees/id/fixture-repo",
              managedWorkspaceTitle("fixture-repo", branch),
              [],
            ),
            local,
          ];
          for (const listener of listeners) listener();
          return {
            ok: true as const,
            value: {
              commandId: "command-id",
              result: { kind: "success" as const },
            },
          };
        },
      },
    },
  } as unknown as ClientContext;

  const decoration = createWorktreeDecoration(ctx);
  const option = (await decoration.ui.options(
    { sessionId: sourceSessionId as never },
    new AbortController().signal,
  )).find((candidate) => candidate.id === "new");
  assert.ok(option);
  await decoration.ui.onSelect(option, { sessionId: sourceSessionId as never });

  assert.equal(executedLine, `/worktree new ${defaultWorktreeBranch(sourceSessionId)}`);
  assert.equal(connectedWorkspace, "managed");
  assert.equal(openedSession, "new-session");
});

test("host command errors stop before navigation", async () => {
  const sourceSessionId = "session-source";
  const local = workspace("local", "/repo/fixture-repo", "fixture-repo", [sourceSessionId]);
  let navigated = false;
  const ctx = {
    workspaces: {
      list: { getSnapshot: () => ({ items: [local] }), subscribe: () => () => {} },
      async connectWorkspace() {
        navigated = true;
        return "never";
      },
    },
    sessions: { open() {} },
    remote: {
      commands: {
        async execute() {
          return {
            ok: true as const,
            value: {
              commandId: "command-id",
              result: { kind: "error" as const, text: "branch already exists" },
            },
          };
        },
      },
    },
  } as unknown as ClientContext;

  const decoration = createWorktreeDecoration(ctx);
  const option = worktreeOptions([local], sourceSessionId).find((candidate) => candidate.id === "new");
  assert.ok(option);
  await assert.rejects(
    async () => decoration.ui.onSelect(option, { sessionId: sourceSessionId as never }),
    /branch already exists/,
  );
  assert.equal(navigated, false);
});
