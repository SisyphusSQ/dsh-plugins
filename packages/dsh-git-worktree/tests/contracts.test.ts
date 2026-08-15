import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import type { Context } from "@deepseek-ai/cordis";

import { parseWorktreePorcelain } from "../src/git.js";
import { assertPathInside, expandHome } from "../src/paths.js";
import { createWorktreeTool } from "../src/tool.js";
import * as worktreePlugin from "../src/index.js";

const execFileAsync = promisify(execFile);

test("parses NUL-delimited git worktree porcelain", () => {
  const records = parseWorktreePorcelain(
    "worktree /tmp/main\0HEAD abc\0branch refs/heads/main\0\0" +
      "worktree /tmp/linked\0HEAD def\0detached\0locked keep\0\0",
  );
  assert.equal(records.length, 2);
  assert.equal(records[0]?.branch, "refs/heads/main");
  assert.equal(records[1]?.detached, true);
  assert.equal(records[1]?.locked, true);
  assert.equal(records[1]?.lockReason, "keep");
});

test("path containment rejects the base itself and sibling paths", () => {
  assert.throws(() => assertPathInside("/tmp/base", "/tmp/base"));
  assert.throws(() => assertPathInside("/tmp/base", "/tmp/base-other/item"));
  assert.doesNotThrow(() => assertPathInside("/tmp/base", "/tmp/base/item"));
  assert.ok(expandHome("~/.dsh/worktrees").endsWith("/.dsh/worktrees"));
});

test("tool exposes one explicit worktree_create contract", () => {
  const tool = createWorktreeTool({ baseDir: "/tmp/dsh-worktrees" });
  assert.equal(tool.name, "worktree_create");
  assert.deepEqual(tool.parameters.required, ["mode"]);
  assert.ok(tool.output.schema);
});

test("host plugin registers both tool and slash-command surfaces", () => {
  const tools: string[] = [];
  const commands: string[] = [];
  const ctx = {
    tools: {
      register(tool: { name: string }) {
        tools.push(tool.name);
      },
    },
    commands: {
      register(command: { name: string }) {
        commands.push(command.name);
      },
    },
    workspaceRegistry: {
      async create() {},
    },
  } as unknown as Context;

  worktreePlugin.apply(ctx, { baseDir: "/tmp/dsh-worktrees" });
  assert.deepEqual(tools, ["worktree_create"]);
  assert.deepEqual(commands, ["worktree"]);
  assert.deepEqual(worktreePlugin.inject, ["tools", "commands", "workspaceRegistry"]);
});

test("package declares a real DSH bundle patch and web client", async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const packageRoot = join(here, "..", "..");
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const patch = await readFile(join(packageRoot, "cordis.patch.yml"), "utf8");
  const client = await readFile(join(packageRoot, "lib", "client.js"), "utf8");
  assert.equal(manifest.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(manifest.dsh.client.platform, "web");
  assert.equal(manifest.exports["./client"].default, "./lib/client.js");
  assert.match(patch, /name: 'dsh-git-worktree'/);
  assert.match(client, /window\.__ModuleLoader__\.load/);
  assert.match(client, /id: "dsh-git-worktree"/);
});

test("compiled CLI exposes help without running on import", async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const packageRoot = join(here, "..", "..");
  const result = await execFileAsync(
    process.execPath,
    [join(packageRoot, "lib", "src", "cli.js"), "--help"],
    { encoding: "utf8" },
  );
  assert.match(String(result.stdout), /dsh-worktree create/);
  assert.equal(String(result.stderr), "");
});
