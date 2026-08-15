#!/usr/bin/env node

import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

import { archiveWorktrees } from "./archive-worktrees.js";
import { createWorktree, type WorktreeTarget } from "./create-worktree.js";
import { DEFAULT_ARCHIVE_DIR, DEFAULT_BASE_DIR } from "./paths.js";

const HELP = `Usage:
  dsh-worktree create --branch <name> [--repo <path>] [--at <ref>]
  dsh-worktree create --existing <name> [--repo <path>]
  dsh-worktree create --detach [--repo <path>] [--at <ref>]
  dsh-worktree archive [--days <n>] [--apply]

Create options:
  --repo <path>         Repository or a directory inside it (default: cwd)
  --branch <name>       Create a new local branch
  --existing <name>     Use an existing local branch
  --detach              Create a detached worktree
  --at <ref>            Start point for --branch or --detach (default: HEAD)
  --base-dir <path>     Worktree root (default: ~/.dsh/worktrees)

Archive options:
  --days <n>            Minimum root-directory age in days (default: 7)
  --apply               Move eligible worktrees; omission is dry-run
  --base-dir <path>     Worktree root
  --archive-dir <path>  Archive root
`;

function createTarget(values: {
  branch?: string;
  existing?: string;
  detach?: boolean;
  at?: string;
}): WorktreeTarget {
  const selected = Number(values.branch !== undefined) +
    Number(values.existing !== undefined) + Number(values.detach === true);
  if (selected !== 1) {
    throw new Error("choose exactly one of --branch, --existing, or --detach");
  }
  if (values.branch !== undefined) {
    return {
      type: "new-branch",
      branch: values.branch,
      ...(values.at === undefined ? {} : { startPoint: values.at }),
    };
  }
  if (values.existing !== undefined) {
    if (values.at !== undefined) throw new Error("--at is not accepted with --existing");
    return { type: "existing-branch", branch: values.existing };
  }
  return {
    type: "detached",
    ...(values.at === undefined ? {} : { startPoint: values.at }),
  };
}

async function createCommand(argv: string[]): Promise<unknown> {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      repo: { type: "string" },
      branch: { type: "string" },
      existing: { type: "string" },
      detach: { type: "boolean" },
      at: { type: "string" },
      "base-dir": { type: "string" },
    },
  });
  return createWorktree({
    repository: values.repo ?? process.cwd(),
    target: createTarget(values),
    baseDir: values["base-dir"] ?? DEFAULT_BASE_DIR,
  });
}

async function archiveCommand(argv: string[]): Promise<unknown> {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      days: { type: "string" },
      apply: { type: "boolean" },
      "base-dir": { type: "string" },
      "archive-dir": { type: "string" },
    },
  });
  const days = values.days === undefined ? 7 : Number(values.days);
  return archiveWorktrees({
    baseDir: values["base-dir"] ?? DEFAULT_BASE_DIR,
    archiveDir: values["archive-dir"] ?? DEFAULT_ARCHIVE_DIR,
    days,
    apply: values.apply ?? false,
  });
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return;
  }
  const result = command === "create"
    ? await createCommand(rest)
    : command === "archive"
      ? await archiveCommand(rest)
      : undefined;
  if (result === undefined) throw new Error(`unknown command ${JSON.stringify(command)}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
