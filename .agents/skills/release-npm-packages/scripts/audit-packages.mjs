#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";

function parseArguments(argv) {
  const options = {
    repo: process.cwd(),
    npmBin: "npm",
    runPrepack: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--repo") {
      options.repo = argv[++index];
    } else if (argument === "--npm-bin") {
      options.npmBin = argv[++index];
    } else if (argument === "--run-prepack") {
      options.runPrepack = true;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }

  if (!options.repo) {
    throw new Error("--repo 不能为空");
  }
  if (!options.npmBin) {
    throw new Error("--npm-bin 不能为空");
  }
  options.repo = resolve(options.repo);
  return options;
}

function usage() {
  return [
    "用法：audit-packages.mjs [选项]",
    "",
    "  --repo <path>       npm 包或 workspace 根目录，默认当前目录",
    "  --npm-bin <path>    npm 可执行文件，默认 npm",
    "  --run-prepack       允许 npm pack 执行 lifecycle scripts",
    "  --json              以 JSON 输出报告",
  ].join("\n");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizePackagePath(path) {
  return normalize(path).split(sep).join("/").replace(/^\.\//, "");
}

function wildcardExpression(segment) {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`);
}

function childDirectories(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git")
    .map((entry) => join(directory, entry.name))
    .sort();
}

function expandWorkspacePattern(repo, pattern) {
  const normalizedPattern = normalizePackagePath(pattern).replace(/\/$/, "");
  if (!normalizedPattern || normalizedPattern.startsWith("/") || normalizedPattern.split("/").includes("..")) {
    return [];
  }
  const segments = normalizedPattern.split("/");
  const matches = new Set();

  function visit(directory, index) {
    if (index === segments.length) {
      if (existsSync(join(directory, "package.json"))) {
        matches.add(resolve(directory));
      }
      return;
    }

    const segment = segments[index];
    if (segment === "**") {
      visit(directory, index + 1);
      for (const child of childDirectories(directory)) {
        visit(child, index);
      }
      return;
    }

    if (segment.includes("*") || segment.includes("?")) {
      const expression = wildcardExpression(segment);
      for (const child of childDirectories(directory)) {
        if (expression.test(child.split(sep).at(-1))) {
          visit(child, index + 1);
        }
      }
      return;
    }

    const child = join(directory, segment);
    if (existsSync(child) && statSync(child).isDirectory()) {
      visit(child, index + 1);
    }
  }

  visit(repo, 0);
  return [...matches];
}

function readPnpmWorkspacePatterns(repo) {
  const path = join(repo, "pnpm-workspace.yaml");
  if (!existsSync(path)) {
    return [];
  }

  const patterns = [];
  let inPackages = false;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (/^packages\s*:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages && /^\S/.test(line)) {
      break;
    }
    const match = inPackages ? line.match(/^\s+-\s+(.+?)\s*$/) : null;
    if (match) {
      patterns.push(match[1].replace(/^['"]|['"]$/g, ""));
    }
  }
  return patterns;
}

function workspacePatterns(repo, rootManifest) {
  if (Array.isArray(rootManifest.workspaces)) {
    return rootManifest.workspaces;
  }
  if (Array.isArray(rootManifest.workspaces?.packages)) {
    return rootManifest.workspaces.packages;
  }
  return readPnpmWorkspacePatterns(repo);
}

function discoverPackageDirectories(repo, rootManifest) {
  const patterns = workspacePatterns(repo, rootManifest);
  if (patterns.length === 0) {
    return [repo];
  }

  const included = new Set();
  for (const pattern of patterns.filter((item) => !item.startsWith("!"))) {
    for (const directory of expandWorkspacePattern(repo, pattern)) {
      included.add(directory);
    }
  }
  for (const pattern of patterns.filter((item) => item.startsWith("!"))) {
    for (const directory of expandWorkspacePattern(repo, pattern.slice(1))) {
      included.delete(directory);
    }
  }
  return [...included].sort();
}

function collectStringTargets(value, targets) {
  if (typeof value === "string") {
    if (value.startsWith("./") && !value.includes("*")) {
      targets.add(normalizePackagePath(value));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringTargets(item, targets);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectStringTargets(item, targets);
    }
  }
}

function entryTargets(manifest) {
  const targets = new Set();
  for (const field of ["main", "module", "types", "typings"]) {
    const value = manifest[field];
    if (typeof value === "string" && !value.includes("*")) {
      targets.add(normalizePackagePath(value));
    }
  }
  const bins = typeof manifest.bin === "string" ? [manifest.bin] : Object.values(manifest.bin ?? {});
  for (const path of bins) {
    if (typeof path === "string" && !path.includes("*")) {
      targets.add(normalizePackagePath(path));
    }
  }
  collectStringTargets(manifest.exports, targets);
  return { targets, bins: bins.filter((item) => typeof item === "string").map(normalizePackagePath) };
}

function parsePackOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("npm pack 没有返回 JSON");
  }
  const firstArray = trimmed.indexOf("[");
  const lastArray = trimmed.lastIndexOf("]");
  if (firstArray !== -1 && lastArray > firstArray) {
    return JSON.parse(trimmed.slice(firstArray, lastArray + 1));
  }
  return JSON.parse(trimmed);
}

function addIssue(issues, code, message, path) {
  const issue = { code, message };
  if (path) {
    issue.path = path;
  }
  const signature = JSON.stringify(issue);
  if (!issues.some((item) => JSON.stringify(item) === signature)) {
    issues.push(issue);
  }
}

function localMarkdownTargets(readmeContents) {
  const targets = new Set();
  const expression = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of readmeContents.matchAll(expression)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.includes(">")) {
      target = target.slice(1, target.indexOf(">"));
    } else {
      target = target.split(/\s+["']/)[0];
    }
    if (!target || target.startsWith("#") || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) {
      continue;
    }
    target = target.split(/[?#]/)[0];
    try {
      target = decodeURIComponent(target);
    } catch {
      // Keep the literal target so a malformed path is reported as missing.
    }
    targets.add(normalizePackagePath(target));
  }
  return targets;
}

function looksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

function scanPackedText(packageDir, packedPaths, errors) {
  const secretPatterns = [
    /npm_[A-Za-z0-9]{20,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];
  const localPathPattern = /(?:\/Users\/[^\s'"`]+|\/home\/[^\s'"`]+)/;

  for (const packedPath of packedPaths) {
    const absolutePath = resolve(packageDir, packedPath);
    if (relative(packageDir, absolutePath).startsWith("..") || !existsSync(absolutePath)) {
      continue;
    }
    const stats = statSync(absolutePath);
    if (!stats.isFile() || stats.size > 1024 * 1024) {
      continue;
    }
    const buffer = readFileSync(absolutePath);
    if (looksBinary(buffer)) {
      continue;
    }
    const contents = buffer.toString("utf8");
    if (localPathPattern.test(contents)) {
      addIssue(errors, "LOCAL_ABSOLUTE_PATH", "打包内容包含本机绝对路径", packedPath);
    }
    if (secretPatterns.some((pattern) => pattern.test(contents))) {
      addIssue(errors, "SECRET_PATTERN", "打包内容疑似包含凭据或私钥", packedPath);
    }
  }
}

function auditPackage(packageDir, manifest, options) {
  const args = ["pack", "--dry-run", "--json"];
  if (!options.runPrepack) {
    args.push("--ignore-scripts");
  }
  args.push(packageDir);

  const result = spawnSync(options.npmBin, args, {
    cwd: options.repo,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const report = {
    name: manifest.name,
    version: manifest.version,
    directory: normalizePackagePath(relative(options.repo, packageDir)) || ".",
    errors: [],
    warnings: [],
  };
  if (result.error || result.status !== 0) {
    addIssue(
      report.errors,
      "PACK_COMMAND_FAILED",
      result.error?.message ?? result.stderr.trim() ?? `npm pack 退出码 ${result.status}`,
    );
    return report;
  }

  let packEntries;
  try {
    packEntries = parsePackOutput(result.stdout);
  } catch (error) {
    addIssue(report.errors, "PACK_JSON_INVALID", `无法解析 npm pack JSON：${error.message}`);
    return report;
  }
  const pack = Array.isArray(packEntries) ? packEntries[0] : packEntries;
  if (!pack || !Array.isArray(pack.files)) {
    addIssue(report.errors, "PACK_JSON_INVALID", "npm pack JSON 缺少 files 清单");
    return report;
  }

  report.pack = {
    filename: pack.filename,
    size: pack.size,
    unpackedSize: pack.unpackedSize,
    entryCount: pack.entryCount ?? pack.files.length,
    integrity: pack.integrity,
    shasum: pack.shasum,
  };
  const filesByPath = new Map(pack.files.map((file) => [normalizePackagePath(file.path), file]));
  const packedPaths = new Set(filesByPath.keys());

  if (!packedPaths.has("package.json")) {
    addIssue(report.errors, "MISSING_PACKAGE_JSON", "打包内容缺少 package.json", "package.json");
  }
  const localReadme = readdirSync(packageDir).find((name) => /^readme(?:\..+)?$/i.test(name));
  if (localReadme && !packedPaths.has(normalizePackagePath(localReadme))) {
    addIssue(report.errors, "MISSING_README", "仓库内 README 未进入打包内容", localReadme);
  }
  const localLicense = readdirSync(packageDir).find((name) => /^(?:licen[cs]e|copying)(?:\..+)?$/i.test(name));
  if (localLicense && !packedPaths.has(normalizePackagePath(localLicense))) {
    addIssue(report.errors, "MISSING_LICENSE", "仓库内许可证文件未进入打包内容", localLicense);
  }

  const { targets, bins } = entryTargets(manifest);
  for (const target of targets) {
    if (!packedPaths.has(target)) {
      addIssue(report.errors, "MISSING_ENTRY", "package.json 声明的入口未进入打包内容", target);
    }
  }
  for (const bin of bins) {
    const packed = filesByPath.get(bin);
    if (!packed) {
      continue;
    }
    if (packed.mode !== 0o755) {
      addIssue(report.errors, "BIN_NOT_EXECUTABLE", "CLI 入口的打包权限不是 0755", bin);
    }
    const localBin = resolve(packageDir, bin);
    if (existsSync(localBin) && !readFileSync(localBin, "utf8").startsWith("#!")) {
      addIssue(report.errors, "BIN_MISSING_SHEBANG", "CLI 入口缺少 shebang", bin);
    }
  }

  for (const packedPath of packedPaths) {
    if (/(^|\/)(?:test|tests)(?:\/|$)|\.test\.[^/]+$/i.test(packedPath)) {
      addIssue(report.errors, "TEST_ARTIFACT", "测试文件进入了发布包", packedPath);
    }
  }

  if (localReadme) {
    const readmePath = join(packageDir, localReadme);
    for (const target of localMarkdownTargets(readFileSync(readmePath, "utf8"))) {
      const resolvedTarget = normalizePackagePath(join(dirname(localReadme), target));
      if (!packedPaths.has(resolvedTarget)) {
        addIssue(report.errors, "MISSING_README_ASSET", "README 引用的本地文件未进入打包内容", resolvedTarget);
      }
    }
  }

  scanPackedText(packageDir, packedPaths, report.errors);
  return report;
}

function printHuman(report) {
  for (const item of report.packages) {
    const status = item.errors.length === 0 ? "OK" : "FAIL";
    console.log(`${status} ${item.name}@${item.version} (${item.directory})`);
    for (const error of item.errors) {
      console.log(`  ERROR ${error.code}: ${error.message}${error.path ? ` [${error.path}]` : ""}`);
    }
  }
  console.log(
    `packages=${report.summary.packages} skippedPrivate=${report.summary.skippedPrivate} errors=${report.summary.errors} warnings=${report.summary.warnings}`,
  );
}

function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(usage());
    return;
  }

  const rootManifestPath = join(options.repo, "package.json");
  if (!existsSync(rootManifestPath)) {
    console.error(`找不到 ${rootManifestPath}`);
    process.exitCode = 2;
    return;
  }

  const rootManifest = readJson(rootManifestPath);
  const directories = discoverPackageDirectories(options.repo, rootManifest);
  const packages = [];
  let skippedPrivate = 0;
  for (const directory of directories) {
    const manifest = readJson(join(directory, "package.json"));
    if (manifest.private === true) {
      skippedPrivate += 1;
      continue;
    }
    packages.push(auditPackage(directory, manifest, options));
  }

  const errors = packages.reduce((count, item) => count + item.errors.length, 0);
  const warnings = packages.reduce((count, item) => count + item.warnings.length, 0);
  const report = {
    repo: options.repo,
    mode: options.runPrepack ? "with-prepack" : "content-only",
    packages,
    summary: {
      packages: packages.length,
      skippedPrivate,
      errors,
      warnings,
      ok: errors === 0,
    },
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report);
  }
  if (!report.summary.ok) {
    process.exitCode = 1;
  }
}

main();
