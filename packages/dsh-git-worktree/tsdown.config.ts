import { defineConfig } from "tsdown";

const packageId = "dsh-git-worktree";

export default defineConfig({
  name: `${packageId}/client`,
  entry: { client: "src/client.ts" },
  outDir: "lib",
  format: "cjs",
  platform: "browser",
  target: "es2022",
  clean: false,
  dts: false,
  sourcemap: true,
  outputOptions: {
    entryFileNames: "client.js",
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(packageId)}, factory: (require) => {`,
    footer: "return module.exports; } });",
    intro: "var module = { exports: {} }; var exports = module.exports;",
  },
});
