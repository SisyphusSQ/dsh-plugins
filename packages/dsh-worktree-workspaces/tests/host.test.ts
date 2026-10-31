import assert from "node:assert/strict";
import { access, mkdtemp, realpath, rm, readFile } from "node:fs/promises";
import { watch } from "node:fs";
import type { SandboxPolicy } from "@deepseek-ai/dsh-sandbox";
import type { SubprocessSpawnSpec } from "@deepseek-ai/dsh-subprocess";
import { runHostCommand } from "../src/host-runtime.js";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Context } from "@deepseek-ai/cordis";
import LocalFileSystem from "@deepseek-ai/dsh-fs-local";
import LocalSubprocessRuntime from "@deepseek-ai/dsh-subprocess-local";
import LocalSandboxProvider from "@deepseek-ai/dsh-sandbox-local";
import type { CommandDefinition, CommandInvocation } from "@deepseek-ai/dsh-commands";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";

import { apply } from "../src/index.js";
import { createTestRepository, git } from "./helpers.js";

// These regressions fail if either Host entry falls back to standalone Node I/O.
function guardedHost(repository: string, baseDir: string) {
  let tool!: ToolDefinition;
  let command!: CommandDefinition;
  const ctx = {
    tools: { register(value: ToolDefinition) { tool = value; } },
    commands: { register(value: CommandDefinition) { command = value; } },
    workspaceRegistry: { async create() { assert.fail("denied calls cannot register a Workspace"); } },
    workingDirectory: { async ensure() { return repository; } },
    sandboxPolicy: { resolve() { return { mode: "read-only", workspaceRoot: repository }; } },
    sandbox: { async confine() { throw new Error("caller sandbox unavailable"); } },
    subprocess: {
      async resolveExecutable() { return "/usr/bin/git"; },
      spawn() { assert.fail("a failed confinement cannot spawn"); },
    },
    fs: {},
  } as unknown as Context;
  apply(ctx, { baseDir });
  return { tool, command };
}

function localHost(repository: string, baseDir: string, mode: "read-only" | "workspace-write" | "danger-full-access") {
  const root = new Context();
  new LocalFileSystem(root, { cwd: process.cwd(), diffBasisMaxBytes: 10 * 1024 * 1024 });
  const subprocess = new LocalSubprocessRuntime(root);
  const sandbox = new LocalSandboxProvider(root, { runnerCommand: [], runnerFailureSignatures: [], probeTimeoutMs: 5_000 });
  const policies: SandboxPolicy[] = [];
  const spawns: SubprocessSpawnSpec[] = [];
  const confine = sandbox.confine.bind(sandbox);
  sandbox.confine = async (argv, policy, signal) => {
    policies.push(policy);
    return confine(argv, policy, signal);
  };
  const spawn = subprocess.spawn.bind(subprocess);
  subprocess.spawn = (spec) => { spawns.push(spec); return spawn(spec); };
  let tool!: ToolDefinition;
  let command!: CommandDefinition;
  const ctx = root.extend({
    tools: { register(value: ToolDefinition) { tool = value; } },
    commands: { register(value: CommandDefinition) { command = value; } },
    workspaceRegistry: { async create(path: string, title: string) { return { id: "workspace-id", path, title }; } },
    workingDirectory: { async ensure() { return repository; } },
    sandboxPolicy: { resolve() { return { mode, workspaceRoot: repository }; } },
  });
  apply(ctx, { baseDir });
  return { tool, command, ctx, policies, spawns, dispose: () => root.fiber.dispose() };
}

test("Host tool and command resolve the effective directory, not immutable header.cwd", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const host = localHost(fixture.repository, join(fixture.root, "worktrees"), "danger-full-access");
  t.after(host.dispose);
  const agent = { session: { header: { cwd: "/nonexistent/original-project" } } };
  const result = await host.tool.execute({ mode: "detached" }, {
    agent, signal: new AbortController().signal,
  } as ToolRunContext) as { repositoryRoot: string };
  assert.equal(result.repositoryRoot, fixture.repository);
  const status = await host.command.handler({
    agent, rawInput: "status", attachments: [], signal: new AbortController().signal,
  } as unknown as CommandInvocation);
  assert.equal(status.kind, "success");
  assert.match(status.text ?? "", new RegExp(fixture.repository));
});

for (const mode of ["read-only", "workspace-write"] as const) {
  test(`native ${mode} cannot write outside the caller workspace or create a branch`, async (t) => {
    const fixture = await createTestRepository();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));
    // The home directory is outside sandbox providers' permitted temporary roots.
    const outside = await realpath(await mkdtemp(join(homedir(), ".dsh-worktree-policy-test-")));
    t.after(() => rm(outside, { recursive: true, force: true }));
    const baseDir = join(outside, "worktrees");
    const host = localHost(fixture.repository, baseDir, mode);
    t.after(host.dispose);
    await assert.rejects(host.tool.execute({ mode: "new-branch", branch: `denied-${mode}` }, {
      agent: { session: { header: { cwd: fixture.repository } } },
      signal: new AbortController().signal,
    } as ToolRunContext), /Operation not permitted|Permission denied|Read-only file system/i);
    assert.ok(host.policies.length > 0);
    for (const policy of host.policies) assert.deepEqual(policy, { mode, workspaceRoot: fixture.repository });
    await assert.rejects(access(baseDir));
    assert.equal((await git(fixture.repository, ["branch", "--list", `denied-${mode}`])).trim(), "");
  });
}

test("Host model tool fails closed instead of bypassing caller confinement", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const baseDir = join(fixture.root, "denied-worktrees");
  const { tool } = guardedHost(fixture.repository, baseDir);
  await assert.rejects(tool.execute({ mode: "new-branch", branch: "denied" }, {
    agent: { session: { header: { cwd: fixture.repository } } },
    signal: new AbortController().signal,
  } as ToolRunContext), /caller sandbox unavailable/);
  await assert.rejects(access(baseDir));
  assert.equal((await git(fixture.repository, ["branch", "--list", "denied"])).trim(), "");
});

test("Host slash command status also uses the caller's sandbox", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const { command } = guardedHost(fixture.repository, join(fixture.root, "worktrees"));
  const result = await command.handler({
    agent: { session: { header: { cwd: fixture.repository } } },
    rawInput: "status", attachments: [], signal: new AbortController().signal,
  } as unknown as CommandInvocation);
  assert.equal(result.kind, "error");
  assert.match(result.text ?? "", /caller sandbox unavailable/);
});

test("native workspace-write permits new, existing and detached worktrees inside its unchanged root", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const host = localHost(fixture.repository, join(fixture.repository, ".worktrees"), "workspace-write");
  t.after(host.dispose);
  await git(fixture.repository, ["branch", "existing-native"]);
  for (const args of [
    { mode: "new-branch", branch: "native-new" },
    { mode: "existing-branch", branch: "existing-native" },
    { mode: "detached" },
  ]) {
    const value = await host.tool.execute({ ...args, repository: "." }, {
      agent: { session: { header: { cwd: "/old-project" } } }, signal: new AbortController().signal,
    } as ToolRunContext) as { path: string; mode: string; headCommit: string };
    assert.equal(value.mode, args.mode);
    assert.equal((await git(value.path, ["rev-parse", "HEAD"])).trim(), value.headCommit);
  }
  for (const policy of host.policies) assert.deepEqual(policy, { mode: "workspace-write", workspaceRoot: fixture.repository });
  for (const spec of host.spawns) {
    assert.equal(spec.graceMs, 3_000);
    assert.deepEqual(spec.stdio, { stdin: "ignore", stdout: { maxBytes: 4 * 1024 * 1024 }, stderr: { maxBytes: 4 * 1024 * 1024 } });
    assert.equal(spec.env?.GIT_OPTIONAL_LOCKS, "0");
  }
});

test("Host cancellation joins the real managed child before rejecting", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const host = localHost(fixture.repository, join(fixture.root, "worktrees"), "danger-full-access");
  t.after(host.dispose);
  const ready = join(fixture.root, "ready");
  const abort = new AbortController();
  const started = new Promise<void>((resolve, reject) => {
    const watcher = watch(fixture.root, (_event, file) => { if (String(file) === "ready") resolve(); });
    watcher.on("error", reject);
    t.after(() => watcher.close());
  });
  const running = runHostCommand(host.ctx, { mode: "danger-full-access", workspaceRoot: fixture.repository }, fixture.repository, [
    "node", "--input-type=module", "-e",
    "import fs from 'node:fs'; fs.writeFileSync(process.argv[1]+'.tmp', String(process.pid)); fs.renameSync(process.argv[1]+'.tmp', process.argv[1]); setInterval(()=>{},1000);",
    ready,
  ], abort.signal);
  // Attach the rejection observer before cancellation to avoid an unhandled-rejection race.
  const rejected = assert.rejects(running, /test cancellation/);
  await Promise.race([started, new Promise<never>((_resolve, reject) => { const timer = setTimeout(() => reject(new Error("child did not start")), 10_000); timer.unref(); })]);
  const pid = Number(await readFile(ready, "utf8"));
  abort.abort(new Error("test cancellation"));
  await rejected;
  assert.throws(() => process.kill(pid, 0), (error: NodeJS.ErrnoException) => error.code === "ESRCH");
});

test("Host runner rejects truncated output instead of returning a successful partial value", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const host = localHost(fixture.repository, join(fixture.root, "worktrees"), "danger-full-access");
  t.after(host.dispose);
  await assert.rejects(runHostCommand(host.ctx, { mode: "danger-full-access", workspaceRoot: fixture.repository }, fixture.repository,
    ["node", "-e", "process.stdout.write('x'.repeat(4*1024*1024+1))"]), /output exceeds/);
});
