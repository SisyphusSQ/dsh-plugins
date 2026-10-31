import { mkdir, realpath, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { runGit } from "./git.js";
import { assertPathInside, expandHome } from "./paths.js";
import type { WorktreeRuntime } from "./runtime.js";

/** Native Node capabilities for the standalone CLI/library; never used by Host entry points. */
export function standaloneRuntime(cwd = process.cwd()): WorktreeRuntime {
  return {
    cwd,
    git: runGit,
    async realpath(path, signal) {
      signal?.throwIfAborted();
      return realpath(resolve(cwd, path));
    },
    async ensureDirectory(path, signal) {
      signal?.throwIfAborted();
      const absolute = path.startsWith("~") ? expandHome(path) : resolve(cwd, path);
      await mkdir(absolute, { recursive: true });
      return realpath(absolute);
    },
    async mkdir(path, signal) {
      signal?.throwIfAborted();
      await mkdir(path);
    },
    async removeGeneratedParent(base, parent, signal) {
      signal?.throwIfAborted();
      assertPathInside(base, parent);
      if (await realpath(parent) !== parent) throw new Error("generated parent changed identity");
      await rm(parent, { recursive: true, force: true });
    },
  };
}
