import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { mkdir, realpath } from "node:fs/promises";

export const DEFAULT_BASE_DIR = "~/.dsh/worktrees";
export const DEFAULT_ARCHIVE_DIR = "~/.dsh/archived_worktrees";

export function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith(`~${sep}`)) return resolve(homedir(), input.slice(2));
  if (input.startsWith("~")) {
    throw new Error(`unsupported home path ${JSON.stringify(input)}; use ~ or ~/...`);
  }
  return resolve(input);
}

export function isPathInside(base: string, candidate: string): boolean {
  const child = relative(base, candidate);
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

export function assertPathInside(base: string, candidate: string): void {
  if (!isPathInside(base, candidate)) {
    throw new Error(`${candidate} escapes configured base directory ${base}`);
  }
}

export async function ensureCanonicalDirectory(input: string): Promise<string> {
  const absolute = expandHome(input);
  await mkdir(absolute, { recursive: true });
  return realpath(absolute);
}
