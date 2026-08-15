---
name: release-npm-packages
description: 安全发布一个 npm 包或 workspace/monorepo 中的一组 npm 包，并完成 tarball 内容审计、认证选择、顺序发布、registry 精确回读、消费端安装、Git tag/Release 对齐和凭据清理。用户要求检查是否可发 npm、执行 npm 发版、处理 2FA/临时 token、从部分发布中恢复，或复核已发布版本时使用。
---

# npm 包发版

把“代码已经完成”转换成可验证的发布闭环。不要把构建成功、`npm pack` 成功或发布命令返回成功当成 registry 与消费端已经可用。

## 先确定边界

1. 阅读仓库 `AGENTS.md`、发布文档、根目录与各包 `package.json`、workspace 配置和现有 release 脚本。
2. 列出发布目标：包名、版本、dist-tag、registry、包之间的依赖顺序、Git 分支与预期 tag。
3. 检查 `git status --short --branch`，保留用户已有改动。不要自行 reset、clean、切分支或创建 worktree。
4. 用 `git ls-remote --symref <remote> HEAD` 确认远端默认分支；不要只相信本地 `origin/HEAD`。
5. 区分授权范围：
   - 审计、dry-run、registry 回读是只读流程。
   - `npm publish`、创建或撤销 token、push tag、创建 Release 都是独立的外部写操作。
   - 用户只说“看看、讨论、给方案”时停止在只读报告；用户明确要求“发布这些包”时，只授权所列 npm 包的发布，不自动扩展到凭据和 GitHub/Gitea 写操作。
6. 遵守当前仓库的测试与发版约定。不要无条件重跑测试，也不要无依据跳过仓库要求的测试。

任何目标名称、版本、registry、公开范围或授权不清楚且无法从仓库确定时，先停下确认。

## 审计将要发布的内容

先运行不执行 lifecycle scripts 的内容审计：

```bash
node "<skill-dir>/scripts/audit-packages.mjs" --repo "$PWD" --json
```

该脚本发现 npm workspaces 或 `pnpm-workspace.yaml` 中的公开包，逐包运行：

```bash
npm pack --dry-run --json --ignore-scripts <package-directory>
```

它检查：

- `main`、`module`、`types`、`typings`、`exports`、`bin` 指向的静态文件是否真的进入 tarball；
- CLI 是否有 shebang 且打包权限为 `0755`；
- 本地 README/LICENSE 是否入包，README 引用的本地资源是否入包；
- 测试文件、本机绝对路径、npm token 形态和私钥标记是否泄露。

这一步只检查当前已有产物。若包依赖 `prepack`/`prepare` 生成文件，在说明会执行项目脚本及其可能产生的构建文件或缓存后，再运行：

```bash
node "<skill-dir>/scripts/audit-packages.mjs" --repo "$PWD" --run-prepack --json
```

不要直接解析混有 lifecycle 日志的 `npm publish --json` 输出；保留原始退出码和 stdout/stderr，发布结果以 registry 回读为准。

同时人工核对每个 manifest：

- `name`、`version`、`description`、`license`、`repository`、`engines`、`peerDependencies`；
- `files`、`.npmignore` 与构建目录是否一致；
- `publishConfig.registry`、`publishConfig.access` 和目标 dist-tag；
- 内部依赖是否引用即将存在的版本，而非无法发布的 `workspace:` 范围；
- npm 上同名同版本是否已经存在。

包名返回 404 只表示查询时不存在，不代表名称已被锁定；真正发布前立即再查一次。

## 选择认证方式

优先级如下：

1. CI 的 npm Trusted Publishing/OIDC；
2. 已登录账号的交互式 OTP 或 WebAuthn；
3. 仅在前两者不可用时，创建短有效期、最小包范围、仅发布权限的临时 granular token。

涉及登录、2FA、浏览器、token、认证失败、部分发布或凭据清理时，必须先读 [references/auth-and-recovery.md](references/auth-and-recovery.md)。不要把 token 放进聊天、命令参数、shell history、Git、构建日志或报告。

## 执行发布

1. 在外部写操作开始前，再次输出最终矩阵：包名、版本、tag、registry、发布顺序以及已经获得的授权。
2. 按内部依赖拓扑顺序逐包发布。默认串行；一个包失败就暂停后续包，先回读实际 registry 状态。
3. 使用包自身声明的 registry/access；仅在明确需要时传 `--tag`、`--access` 或 `--registry`，避免命令行覆盖与 manifest 冲突。
4. 记录每次命令的包名、版本、退出码和无凭据日志。不要记录认证值。
5. 任何名称、版本或 tarball 内容在发布前发生变化，都重新运行内容审计并重新核对发布矩阵。

不要自动 `npm unpublish`、复用已发布版本号或把失败伪装成完成。npm 版本不可覆盖；部分成功按恢复流程处理。

## 精确回读 registry

把内容审计的 JSON 输出保存为文件，可直接作为回读输入；脚本会读取其中每个包的版本、integrity 和 shasum，并默认检查 `latest`。若发布到其他 tag，在发布前记录中整理以下预期数组：

```json
[
  {
    "name": "example-package",
    "version": "1.2.3",
    "tag": "latest",
    "integrity": "sha512-...",
    "shasum": "..."
  }
]
```

执行：

```bash
node "<skill-dir>/scripts/readback-registry.mjs" \
  --expected-file /absolute/path/to/expected.json \
  --registry https://registry.npmjs.org \
  --json
```

回读必须同时确认：

- 精确版本已经出现在 `versions`；
- 目标 dist-tag 指向该版本；
- `dist.integrity` 和 `dist.shasum` 与预期一致；
- tarball URL 存在。

registry 可能有短暂传播延迟。允许在明确记录次数和间隔的前提下做有限重试；不要降低版本、tag 或摘要的判定标准。

## 验证真实消费

在 registry 回读通过后，用新建的临时目录或项目规定的隔离 profile 安装精确版本：

- 锁定 registry 与版本，不从本地 workspace/link/file 安装；
- 验证包可安装、入口可 import/require、CLI 可执行；
- 框架插件再验证框架能发现并加载插件；
- 明确区分 install smoke、框架加载验证和真实 E2E。

只清理本轮创建的精确临时目录。不要删除用户缓存或工作区产物。

## Git 与发布页闭环

仅在相应写操作已获授权时执行：

1. 确认目标提交已 push，工作树状态符合仓库要求。
2. 创建不可歧义的 tag；monorepo 可用统一版本 tag 或逐包 tag，但必须遵循现有约定。
3. push tag 后从远端回读 tag 指向的 commit SHA。
4. 创建 Release 后回读 Release 的 tag、目标 SHA、标题和附件。
5. README/发布状态只在 npm registry 和真实消费验证通过后标记为“已发布”。

不要根据本地 tag、网页成功提示或 CLI 零退出码推断远端闭环完成。

## 收尾报告

最终按以下类别报告：

- 已完成：每个包的版本、tag、integrity/shasum、消费端验证、Git tag/Release SHA；
- 未执行：因仓库约定或授权范围而跳过的测试、Git 或发布页动作；
- 失败/部分成功：已发布集合、未发布集合、错误原文摘要和下一恢复点；
- 凭据清理：临时配置是否删除、临时 token 是否已从服务端撤销；
- 本地改动：新增或修改的文件，以及是否 commit/push。

只有所有必需环节均已完成且没有仍然有效的临时凭据时，才把任务描述为“发版完成”。
