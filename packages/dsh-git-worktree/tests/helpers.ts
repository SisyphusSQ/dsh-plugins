import { execFile } from "node:child_process";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return String(result.stdout);
}

export async function createTestRepository(): Promise<{ root: string; repository: string }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "dsh-git-worktree-test-")));
  const repository = join(root, "repository");
  await git(root, ["init", "--initial-branch=main", repository]);
  await git(repository, ["config", "user.name", "DSH Test"]);
  await git(repository, ["config", "user.email", "dsh-test@example.invalid"]);
  await writeFile(join(repository, "README.md"), "fixture\n", "utf8");
  await git(repository, ["add", "README.md"]);
  await git(repository, ["commit", "-m", "initial"]);
  return { root, repository };
}
