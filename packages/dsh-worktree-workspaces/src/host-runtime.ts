import type { Context } from "@deepseek-ai/cordis";
import type { CommandInvocation } from "@deepseek-ai/dsh-commands";
import type {} from "@deepseek-ai/dsh-fs";
import type { SandboxExecutionPolicy } from "@deepseek-ai/dsh-sandbox";
import type {} from "@deepseek-ai/dsh-sandbox-policy";
import type {} from "@deepseek-ai/dsh-subprocess";
import type {} from "@deepseek-ai/dsh-working-directory";
import type { ToolRunContext } from "@deepseek-ai/dsh-tools";

import { GitCommandError } from "./git.js";
import type { WorktreeRuntime } from "./runtime.js";

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 60_000;
const GRACE_MS = 3_000;

// The filesystem seam has no mkdir/rm verbs. Mutations therefore run as static
// argv programs through the SAME caller policy as Git, never host fs/promises.
const DIRECTORY_PROGRAM = `
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const [operation, input, base] = process.argv.slice(1);
async function main() {
  if (input.startsWith('~') && input !== '~' && !input.startsWith('~/')) throw new Error('unsupported home path');
  const value = input === '~' ? os.homedir() : input.startsWith('~/') ? path.resolve(os.homedir(), input.slice(2)) : path.resolve(input);
  if (operation === 'ensure') await fs.mkdir(value, { recursive: true });
  else if (operation === 'mkdir') await fs.mkdir(value);
  else if (operation === 'remove') {
    const canonical = await fs.realpath(value);
    const relative = path.relative(base, canonical);
    if (canonical !== value || relative === '' || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('generated parent changed identity');
    await fs.rm(canonical, { recursive: true, force: true });
    return;
  } else throw new Error('unknown directory operation');
  process.stdout.write(JSON.stringify(await fs.realpath(value)));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
`;

/** Run literal argv with bounded output, a deadline, and joined managed-range teardown. */
export async function runHostCommand(
  ctx: Context,
  policy: SandboxExecutionPolicy,
  cwd: string,
  argv: readonly string[],
  signal?: AbortSignal,
): Promise<string> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new Error("worktree command timed out")), TIMEOUT_MS);
  timer.unref();
  const operation = signal === undefined ? deadline.signal : AbortSignal.any([signal, deadline.signal]);
  try {
    operation.throwIfAborted();
    const executable = await ctx.subprocess.resolveExecutable(argv[0]!, undefined, operation);
    const command = [executable, ...argv.slice(1)];
    const wrapped = policy.mode === "danger-full-access"
      ? command
      : (await ctx.sandbox.confine(command, { ...policy, mode: policy.mode }, operation)).argv;
    operation.throwIfAborted();
    const child = ctx.subprocess.spawn({
      argv: wrapped,
      cwd,
      signal: operation,
      graceMs: GRACE_MS,
      stdio: { stdin: "ignore", stdout: { maxBytes: MAX_OUTPUT_BYTES }, stderr: { maxBytes: MAX_OUTPUT_BYTES } },
      env: {
        GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_COMMON_DIR: undefined,
        GIT_INDEX_FILE: undefined, GIT_OBJECT_DIRECTORY: undefined,
        GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined, GIT_CONFIG: undefined,
        GIT_CONFIG_PARAMETERS: undefined, GIT_CONFIG_COUNT: undefined,
        GIT_CEILING_DIRECTORIES: undefined, GIT_PREFIX: undefined,
        GIT_SHALLOW_FILE: undefined, GIT_GRAFT_FILE: undefined,
        GIT_REPLACE_REF_BASE: undefined, GIT_ATTR_SOURCE: undefined,
        GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1", GIT_OPTIONAL_LOCKS: "0",
      },
    });
    try {
      const outcome = await child.done;
      operation.throwIfAborted();
      const stdout = child.collected.stdout!.readFrom(0);
      const stderr = child.collected.stderr!.readFrom(0);
      if (outcome.exitCode !== 0) {
        throw new GitCommandError(cwd, argv, stderr.text, outcome.exitCode ?? outcome.signal ?? "unknown");
      }
      if (stdout.lossy || stderr.lossy) throw new Error("worktree command output exceeds 4 MiB");
      return stdout.text;
    } finally {
      child.terminate();
      await child.waitForExit();
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve policy once at the Host operation boundary; cwd is NOT the permission root. */
export async function hostRuntime(
  ctx: Context,
  caller: Pick<ToolRunContext, "agent" | "signal"> | CommandInvocation,
): Promise<WorktreeRuntime> {
  const cwd = caller.agent === undefined
    ? ctx.workingDirectory.defaultDirectory
    : await ctx.workingDirectory.ensure(caller.agent, caller.signal);
  const policy = ctx.sandboxPolicy.resolve(
    caller.agent === undefined ? {} : { session: caller.agent.session },
  );
  const canonical = async (path: string, signal?: AbortSignal): Promise<string> => {
    const target = await ctx.fs.resolve(path, { cwd, ...(signal === undefined ? {} : { signal }) });
    if ((await ctx.fs.stat(target, signal))?.type !== "directory") {
      throw new Error(`worktree directory does not exist: ${path}`);
    }
    return ctx.fs.processPath(target);
  };
  const directory = async (operation: string, path: string, signal?: AbortSignal, base = ""): Promise<string> => {
    const text = await runHostCommand(ctx, policy, cwd, ["node", "--input-type=module", "-e", DIRECTORY_PROGRAM, operation, path, base], signal);
    return operation === "remove" ? "" : canonical(JSON.parse(text) as string, signal);
  };
  return {
    cwd,
    git: (directory, args, signal) => runHostCommand(ctx, policy, directory, [
      "git", "-c", "core.hooksPath=" + (process.platform === "win32" ? "NUL" : "/dev/null"),
      "-c", "core.fsmonitor=false", ...args,
    ], signal),
    realpath: canonical,
    ensureDirectory: (path, signal) => directory("ensure", path, signal),
    async mkdir(path, signal) { await directory("mkdir", path, signal); },
    async removeGeneratedParent(base, parent, signal) { await directory("remove", parent, signal, base); },
  };
}
