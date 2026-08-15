import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPath = join(skillRoot, "scripts", "audit-packages.mjs");

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "npm-release-audit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeJson(join(root, "package.json"), {
    name: "fixture-workspace",
    private: true,
    workspaces: ["packages/*"],
  });
  return root;
}

function createFakeNpm(root) {
  const fakeNpm = join(root, "fake-npm.mjs");
  writeFileSync(
    fakeNpm,
    `#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
const packageDir = process.argv.at(-1);
process.stdout.write(readFileSync(join(packageDir, ".pack.json"), "utf8"));
`,
  );
  chmodSync(fakeNpm, 0o755);
  return fakeNpm;
}

function createPackage(root, directory, manifest, files, packFiles) {
  const packageDir = join(root, directory);
  mkdirSync(packageDir, { recursive: true });
  writeJson(join(packageDir, "package.json"), manifest);
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = join(packageDir, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  writeJson(join(packageDir, ".pack.json"), [
    {
      name: manifest.name,
      version: manifest.version,
      filename: `${manifest.name}-${manifest.version}.tgz`,
      size: 100,
      unpackedSize: 200,
      files: packFiles,
      entryCount: packFiles.length,
      integrity: "sha512-fixture",
      shasum: "fixture-shasum",
    },
  ]);
}

function runAudit(root, fakeNpm) {
  return spawnSync(
    process.execPath,
    [scriptPath, "--repo", root, "--npm-bin", fakeNpm, "--json"],
    { encoding: "utf8" },
  );
}

test("accepts a publishable workspace package whose packed entries and CLI mode are valid", (t) => {
  const root = createFixture(t);
  const fakeNpm = createFakeNpm(root);
  createPackage(
    root,
    "packages/good-package",
    {
      name: "good-package",
      version: "1.2.3",
      license: "MIT",
      main: "./lib/index.js",
      types: "./lib/index.d.ts",
      bin: { good: "./bin/good.js" },
      exports: {
        ".": { types: "./lib/index.d.ts", default: "./lib/index.js" },
        "./package.json": "./package.json",
      },
    },
    {
      "README.md":
        "# Good\n\n![Demo](screens/demo.png)\n\n" +
        "[Open resource](custom-protocol:fixture)\n",
      LICENSE: "MIT\n",
      "lib/index.js": "export const value = 1;\n",
      "lib/index.d.ts": "export declare const value: number;\n",
      "bin/good.js": "#!/usr/bin/env node\nconsole.log('good');\n",
      "screens/demo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    },
    [
      { path: "package.json", mode: 420, size: 200 },
      { path: "README.md", mode: 420, size: 30 },
      { path: "LICENSE", mode: 420, size: 4 },
      { path: "lib/index.js", mode: 420, size: 24 },
      { path: "lib/index.d.ts", mode: 420, size: 36 },
      { path: "bin/good.js", mode: 493, size: 45 },
      { path: "screens/demo.png", mode: 420, size: 4 },
    ],
  );

  const result = runAudit(root, fakeNpm);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.summary, {
    packages: 1,
    skippedPrivate: 0,
    errors: 0,
    warnings: 0,
    ok: true,
  });
  assert.equal(report.packages[0].name, "good-package");
  assert.deepEqual(report.packages[0].errors, []);
});

test("rejects missing packed entries, a non-executable CLI, test artifacts, missing README assets, and sensitive text", (t) => {
  const root = createFixture(t);
  const fakeNpm = createFakeNpm(root);
  createPackage(
    root,
    "packages/bad-package",
    {
      name: "bad-package",
      version: "1.0.0",
      license: "MIT",
      main: "./lib/index.js",
      types: "./lib/index.d.ts",
      bin: { bad: "./bin/bad.js" },
    },
    {
      "README.md": "# Bad\n\n![Missing](screens/missing.png)\n",
      LICENSE: "MIT\n",
      "lib/index.js":
        "export const home = '/Users/example/private';\n" +
        "export const token = 'npm_abcdefghijklmnopqrstuvwxyz123456';\n",
      "bin/bad.js": "#!/usr/bin/env node\n",
      "tests/leaked.test.js": "throw new Error('not for publish');\n",
    },
    [
      { path: "package.json", mode: 420, size: 200 },
      { path: "README.md", mode: 420, size: 40 },
      { path: "LICENSE", mode: 420, size: 4 },
      { path: "lib/index.js", mode: 420, size: 120 },
      { path: "bin/bad.js", mode: 420, size: 20 },
      { path: "tests/leaked.test.js", mode: 420, size: 35 },
    ],
  );

  const result = runAudit(root, fakeNpm);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  const codes = new Set(report.packages[0].errors.map((error) => error.code));
  assert.deepEqual(
    [...codes].sort(),
    [
      "BIN_NOT_EXECUTABLE",
      "LOCAL_ABSOLUTE_PATH",
      "MISSING_ENTRY",
      "MISSING_README_ASSET",
      "SECRET_PATTERN",
      "TEST_ARTIFACT",
    ].sort(),
  );
});

test("discovers workspace packages and skips private packages", (t) => {
  const root = createFixture(t);
  const fakeNpm = createFakeNpm(root);
  createPackage(
    root,
    "packages/public-package",
    { name: "public-package", version: "0.1.0", license: "MIT" },
    { "README.md": "# Public\n", LICENSE: "MIT\n" },
    [
      { path: "package.json", mode: 420, size: 100 },
      { path: "README.md", mode: 420, size: 9 },
      { path: "LICENSE", mode: 420, size: 4 },
    ],
  );
  writeJson(join(root, "packages/private-package/package.json"), {
    name: "private-package",
    version: "0.1.0",
    private: true,
  });

  const result = runAudit(root, fakeNpm);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.packages, 1);
  assert.equal(report.summary.skippedPrivate, 1);
  assert.deepEqual(report.packages.map((item) => item.name), ["public-package"]);
});
