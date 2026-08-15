import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPath = join(skillRoot, "scripts", "readback-registry.mjs");

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function createRegistry(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function writeExpectations(t, expectations) {
  const root = mkdtempSync(join(tmpdir(), "npm-registry-readback-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const expectedFile = join(root, "expected.json");
  writeFileSync(expectedFile, `${JSON.stringify(expectations, null, 2)}\n`);
  return expectedFile;
}

function metadata(registry, overrides = {}) {
  return {
    name: "sample-package",
    "dist-tags": { latest: "1.0.0" },
    versions: {
      "1.0.0": {
        name: "sample-package",
        version: "1.0.0",
        dist: {
          tarball: `${registry}/sample-package/-/sample-package-1.0.0.tgz`,
          integrity: "sha512-expected",
          shasum: "expected-shasum",
        },
      },
    },
    ...overrides,
  };
}

test("confirms the requested version, dist-tag, integrity, and shasum", async (t) => {
  let registry;
  registry = await createRegistry(t, (request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(metadata(registry)));
  });
  const expectedFile = writeExpectations(t, [
    {
      name: "sample-package",
      version: "1.0.0",
      tag: "latest",
      integrity: "sha512-expected",
      shasum: "expected-shasum",
    },
  ]);

  const result = await runNode([
    scriptPath,
    "--expected-file",
    expectedFile,
    "--registry",
    registry,
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.summary, { packages: 1, errors: 0, ok: true });
  assert.equal(report.packages[0].actual.version, "1.0.0");
  assert.deepEqual(report.packages[0].errors, []);
});

test("rejects a dist-tag or integrity mismatch", async (t) => {
  let registry;
  registry = await createRegistry(t, (request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(metadata(registry)));
  });
  const expectedFile = writeExpectations(t, [
    {
      name: "sample-package",
      version: "1.0.0",
      tag: "next",
      integrity: "sha512-wrong",
    },
  ]);

  const result = await runNode([
    scriptPath,
    "--expected-file",
    expectedFile,
    "--registry",
    registry,
    "--json",
  ]);

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(
    report.packages[0].errors.map((error) => error.code).sort(),
    ["DIST_TAG_MISMATCH", "INTEGRITY_MISMATCH"],
  );
});

test("reports a missing package without treating a registry 404 as success", async (t) => {
  const registry = await createRegistry(t, (request, response) => {
    response.statusCode = 404;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ error: "Not found" }));
  });
  const expectedFile = writeExpectations(t, [
    { name: "missing-package", version: "0.1.0", tag: "latest" },
  ]);

  const result = await runNode([
    scriptPath,
    "--expected-file",
    expectedFile,
    "--registry",
    registry,
    "--json",
  ]);

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.packages[0].errors[0].code, "PACKAGE_MISSING");
});

test("accepts the audit report directly as its expected file", async (t) => {
  let registry;
  registry = await createRegistry(t, (request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(metadata(registry)));
  });
  const expectedFile = writeExpectations(t, {
    packages: [
      {
        name: "sample-package",
        version: "1.0.0",
        pack: {
          integrity: "sha512-expected",
          shasum: "expected-shasum",
        },
      },
    ],
  });

  const result = await runNode([
    scriptPath,
    "--expected-file",
    expectedFile,
    "--registry",
    registry,
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.packages[0].expected.integrity, "sha512-expected");
  assert.equal(report.packages[0].expected.tag, "latest");
});

test("rejects a version whose registry metadata has no tarball URL", async (t) => {
  let registry;
  registry = await createRegistry(t, (request, response) => {
    const value = metadata(registry);
    delete value.versions["1.0.0"].dist.tarball;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(value));
  });
  const expectedFile = writeExpectations(t, [
    { name: "sample-package", version: "1.0.0", tag: "latest" },
  ]);

  const result = await runNode([
    scriptPath,
    "--expected-file",
    expectedFile,
    "--registry",
    registry,
    "--json",
  ]);

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(
    report.packages[0].errors.map((error) => error.code),
    ["DIST_TARBALL_MISSING"],
  );
});
