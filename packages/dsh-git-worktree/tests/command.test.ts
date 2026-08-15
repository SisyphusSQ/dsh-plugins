import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import type { CommandInvocation } from "@deepseek-ai/dsh-commands";

import { createWorktreeCommand } from "../src/command.js";
import { defaultWorktreeBranch, managedWorkspaceTitle } from "../src/protocol.js";
import { createTestRepository, git } from "./helpers.js";

function invocation(cwd: string, rawInput: string, sessionId = "session-123"): CommandInvocation {
  return {
    commandId: "test-command" as CommandInvocation["commandId"],
    agent: {
      session: { header: { id: sessionId, cwd } },
    } as CommandInvocation["agent"],
    rawInput,
    signal: new AbortController().signal,
  };
}

test("bare /worktree reports status without creating another worktree", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const registered: string[] = [];
  const command = createWorktreeCommand({
    baseDir: join(fixture.root, "worktrees"),
    async registerWorkspace(path) {
      registered.push(path);
    },
  });

  const result = await command.handler(invocation(fixture.repository, ""));
  assert.equal(result.kind, "success");
  assert.match(result.text ?? "", /Git worktree：1 个/);
  assert.deepEqual(registered, []);
});

test("/worktree new creates a session branch and registers its Workspace", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const registered: Array<{ path: string; title: string }> = [];
  const command = createWorktreeCommand({
    baseDir: join(fixture.root, "worktrees"),
    async registerWorkspace(path, title) {
      registered.push({ path, title });
    },
  });

  const result = await command.handler(invocation(fixture.repository, " new "));
  const branch = defaultWorktreeBranch("session-123");
  assert.equal(result.kind, "success");
  assert.equal(registered.length, 1);
  assert.equal(registered[0]?.title, managedWorkspaceTitle("repository", branch));
  assert.equal((await git(registered[0]!.path, ["branch", "--show-current"])).trim(), branch);

  const retried = await command.handler(invocation(fixture.repository, " new "));
  assert.equal(retried.kind, "success");
  assert.match(retried.text ?? "", /已复用 Git worktree/);
  assert.equal(registered.length, 2);
  assert.equal(registered[1]?.path, registered[0]?.path);
  assert.equal((await git(fixture.repository, ["worktree", "list", "--porcelain"])).match(/^worktree /gm)?.length, 2);
});

test("/worktree rejects unsupported arguments before touching Git", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const command = createWorktreeCommand({
    baseDir: join(fixture.root, "worktrees"),
    async registerWorkspace() {
      assert.fail("invalid input must not register a Workspace");
    },
  });

  const result = await command.handler(invocation(fixture.repository, "remove everything"));
  assert.deepEqual(result, {
    kind: "error",
    text: "用法：/worktree [status | new [branch]]",
  });
});
