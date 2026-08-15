import assert from "node:assert/strict";
import { access, readFile, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { archiveWorktrees } from "../src/archive-worktrees.js";
import { createWorktree } from "../src/create-worktree.js";
import { createTestRepository, git } from "./helpers.js";

const NOW = new Date("2026-08-14T12:00:00.000Z");
const OLD = new Date("2026-08-01T12:00:00.000Z");

test("honors cancellation before inspecting or moving worktrees", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  await assert.rejects(
    archiveWorktrees({
      baseDir: "/tmp/unused-dsh-worktrees",
      archiveDir: "/tmp/unused-dsh-archive",
      days: 7,
      apply: true,
      signal: controller.signal,
    }),
    /cancelled/,
  );
});

test("dry-run reports an old worktree without moving it", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const baseDir = join(fixture.root, "worktrees");
  const result = await createWorktree({
    repository: fixture.repository,
    target: { type: "new-branch", branch: "archive/dry-run" },
    baseDir,
    worktreeId: "archive-one",
  });
  await utimes(result.path, OLD, OLD);

  const archived = await archiveWorktrees({
    baseDir,
    archiveDir: join(fixture.root, "archive"),
    days: 7,
    apply: false,
    now: NOW,
  });

  assert.equal(archived.records.length, 1);
  assert.equal(archived.records[0]?.status, "eligible");
  await access(result.path);
  await assert.rejects(access(join(fixture.root, "archive")));
});

test("apply moves with git worktree move and writes a manifest", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const baseDir = join(fixture.root, "worktrees");
  const result = await createWorktree({
    repository: fixture.repository,
    target: { type: "new-branch", branch: "archive/apply" },
    baseDir,
    worktreeId: "archive-two",
  });
  await utimes(result.path, OLD, OLD);

  const archived = await archiveWorktrees({
    baseDir,
    archiveDir: join(fixture.root, "archive"),
    days: 7,
    apply: true,
    now: NOW,
  });

  const record = archived.records[0];
  assert.equal(record?.status, "moved");
  assert.ok(record?.targetPath);
  assert.equal((await git(record.targetPath, ["rev-parse", "--show-toplevel"])).trim(), record.targetPath);
  await assert.rejects(access(result.path));
  assert.ok(archived.manifestPath);
  const manifest = await readFile(archived.manifestPath, "utf8");
  assert.match(manifest, /"status":"moved"/);
});

test("locked worktrees are never moved", async (t) => {
  const fixture = await createTestRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const baseDir = join(fixture.root, "worktrees");
  const result = await createWorktree({
    repository: fixture.repository,
    target: { type: "new-branch", branch: "archive/locked" },
    baseDir,
    worktreeId: "archive-three",
  });
  await git(fixture.repository, ["worktree", "lock", "--reason", "keep", result.path]);
  await utimes(result.path, OLD, OLD);

  const archived = await archiveWorktrees({
    baseDir,
    archiveDir: join(fixture.root, "archive"),
    days: 7,
    apply: true,
    now: NOW,
  });

  assert.equal(archived.records[0]?.status, "locked");
  assert.equal(archived.manifestPath, undefined);
  await access(result.path);
});
