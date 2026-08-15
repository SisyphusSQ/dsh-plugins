import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { CreateWorktreeResult } from "../src/create-worktree.js";
import { createTestRepository, git } from "./helpers.js";

const execFileAsync = promisify(execFile);

test("compiled CLI creates a worktree and returns machine-readable JSON", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const baseDir = join(fixture.root, "worktrees");
  const result = await execFileAsync(
    process.execPath,
    [
      join(packageRoot, "lib", "src", "cli.js"),
      "create",
      "--repo",
      fixture.repository,
      "--branch",
      "cli/example",
      "--base-dir",
      baseDir,
    ],
    { encoding: "utf8" },
  );
  const created = JSON.parse(String(result.stdout)) as CreateWorktreeResult;
  assert.equal(created.branch, "cli/example");
  assert.equal(created.next.cwd, created.path);
  assert.equal((await git(created.path, ["branch", "--show-current"])).trim(), "cli/example");
});
