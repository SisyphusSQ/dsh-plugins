#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArguments(argv) {
  const options = {
    registry: "https://registry.npmjs.org",
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--expected-file") {
      options.expectedFile = argv[++index];
    } else if (argument === "--registry") {
      options.registry = argv[++index];
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  if (!options.help && !options.expectedFile) {
    throw new Error("必须提供 --expected-file");
  }
  if (options.expectedFile) {
    options.expectedFile = resolve(options.expectedFile);
  }
  options.registry = options.registry.replace(/\/$/, "");
  return options;
}

function usage() {
  return [
    "用法：readback-registry.mjs --expected-file <path> [选项]",
    "",
    "  --registry <url>       registry 地址，默认 https://registry.npmjs.org",
    "  --json                 以 JSON 输出报告",
  ].join("\n");
}

function addError(report, code, message) {
  report.errors.push({ code, message });
}

function validateExpectations(value) {
  let expectations = value;
  if (!Array.isArray(value) && Array.isArray(value?.packages)) {
    expectations = value.packages.map((item) => ({
      name: item.name,
      version: item.version,
      tag: item.tag,
      integrity: item.pack?.integrity,
      shasum: item.pack?.shasum,
    }));
  }
  if (!Array.isArray(expectations) || expectations.length === 0) {
    throw new Error("预期文件必须是非空 JSON 数组或 audit-packages 报告");
  }
  for (const [index, item] of expectations.entries()) {
    if (!item || typeof item !== "object" || typeof item.name !== "string" || typeof item.version !== "string") {
      throw new Error(`预期文件第 ${index + 1} 项必须包含字符串 name 和 version`);
    }
  }
  return expectations;
}

async function readPackage(expected, registry) {
  const tag = expected.tag ?? "latest";
  const report = {
    expected: { ...expected, tag },
    actual: null,
    errors: [],
  };
  let response;
  try {
    response = await fetch(`${registry}/${encodeURIComponent(expected.name)}`, {
      headers: { accept: "application/vnd.npm.install-v1+json, application/json" },
      redirect: "follow",
    });
  } catch (error) {
    addError(report, "REGISTRY_REQUEST_FAILED", `registry 请求失败：${error.message}`);
    return report;
  }

  if (response.status === 404) {
    addError(report, "PACKAGE_MISSING", `registry 中不存在 ${expected.name}`);
    return report;
  }
  if (!response.ok) {
    addError(report, "REGISTRY_HTTP_ERROR", `registry 返回 HTTP ${response.status}`);
    return report;
  }

  let metadata;
  try {
    metadata = await response.json();
  } catch (error) {
    addError(report, "REGISTRY_JSON_INVALID", `registry 返回的 JSON 无法解析：${error.message}`);
    return report;
  }

  const actualTagVersion = metadata["dist-tags"]?.[tag];
  const versionMetadata = metadata.versions?.[expected.version];
  report.actual = {
    version: versionMetadata?.version,
    tag,
    tagVersion: actualTagVersion,
    tarball: versionMetadata?.dist?.tarball,
    integrity: versionMetadata?.dist?.integrity,
    shasum: versionMetadata?.dist?.shasum,
  };

  if (!versionMetadata) {
    addError(report, "VERSION_MISSING", `registry 中不存在 ${expected.name}@${expected.version}`);
  } else if (!versionMetadata.dist?.tarball) {
    addError(report, "DIST_TARBALL_MISSING", `${expected.name}@${expected.version} 缺少 dist.tarball`);
  }
  if (actualTagVersion !== expected.version) {
    addError(
      report,
      "DIST_TAG_MISMATCH",
      `${expected.name} 的 ${tag} 指向 ${actualTagVersion ?? "<missing>"}，预期 ${expected.version}`,
    );
  }
  if (expected.integrity !== undefined && versionMetadata?.dist?.integrity !== expected.integrity) {
    addError(report, "INTEGRITY_MISMATCH", `${expected.name}@${expected.version} 的 integrity 不匹配`);
  }
  if (expected.shasum !== undefined && versionMetadata?.dist?.shasum !== expected.shasum) {
    addError(report, "SHASUM_MISMATCH", `${expected.name}@${expected.version} 的 shasum 不匹配`);
  }
  return report;
}

function printHuman(report) {
  for (const item of report.packages) {
    const expected = item.expected;
    const status = item.errors.length === 0 ? "OK" : "FAIL";
    console.log(`${status} ${expected.name}@${expected.version} tag=${expected.tag}`);
    for (const error of item.errors) {
      console.log(`  ERROR ${error.code}: ${error.message}`);
    }
  }
  console.log(`packages=${report.summary.packages} errors=${report.summary.errors}`);
}

async function main() {
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
  if (!existsSync(options.expectedFile)) {
    console.error(`找不到 ${options.expectedFile}`);
    process.exitCode = 2;
    return;
  }

  let expectations;
  try {
    expectations = validateExpectations(JSON.parse(readFileSync(options.expectedFile, "utf8")));
  } catch (error) {
    console.error(`无法读取预期文件：${error.message}`);
    process.exitCode = 2;
    return;
  }

  const packages = [];
  for (const expected of expectations) {
    packages.push(await readPackage(expected, options.registry));
  }
  const errors = packages.reduce((count, item) => count + item.errors.length, 0);
  const report = {
    registry: options.registry,
    packages,
    summary: {
      packages: packages.length,
      errors,
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

await main();
