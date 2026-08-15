import assert from "node:assert/strict";
import { access, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createWorktree } from "../src/create-worktree.js";
import { createTestRepository, git } from "./helpers.js";

test("creates a new branch from a repository subdirectory", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const nested = join(fixture.repository, "nested");
  const baseDir = join(fixture.root, "worktrees");
  await mkdir(nested);

  const result = await createWorktree({
    repository: nested,
    target: { type: "new-branch", branch: "feature/example" },
    baseDir,
    worktreeId: "fixture-one",
  });

  assert.equal(result.repositoryRoot, fixture.repository);
  assert.equal(result.path, join(baseDir, "fixture-one", "repository"));
  assert.equal(result.branch, "feature/example");
  assert.equal(result.mode, "new-branch");
  assert.equal(result.sourceDirty, false);
  assert.equal((await git(result.path, ["branch", "--show-current"])).trim(), "feature/example");
  await access(join(result.path, "README.md"));
});

test("reports dirty source state without copying uncommitted files", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeFile(join(fixture.repository, "local-only.txt"), "not committed\n", "utf8");

  const result = await createWorktree({
    repository: fixture.repository,
    target: { type: "detached" },
    baseDir: join(fixture.root, "worktrees"),
    worktreeId: "fixture-two",
  });

  assert.equal(result.sourceDirty, true);
  assert.equal(result.mode, "detached");
  await assert.rejects(access(join(result.path, "local-only.txt")));
});

test("uses an existing local branch", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await git(fixture.repository, ["branch", "existing"]);

  const result = await createWorktree({
    repository: fixture.repository,
    target: { type: "existing-branch", branch: "existing" },
    baseDir: join(fixture.root, "worktrees"),
    worktreeId: "fixture-three",
  });

  assert.equal(result.branch, "existing");
  assert.equal((await git(result.path, ["branch", "--show-current"])).trim(), "existing");
});

test("cleans its generated directory after an invalid branch fails", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const baseDir = join(fixture.root, "worktrees");

  await assert.rejects(
    createWorktree({
      repository: fixture.repository,
      target: { type: "new-branch", branch: "invalid branch" },
      baseDir,
      worktreeId: "fixture-four",
    }),
  );
  assert.deepEqual(await readdir(baseDir), []);
});
