# dsh-git-worktree

为 DeepSeek Harness（DSH）创建和归档 Git linked worktree。同一包提供 `/worktree` slash command、模型工具、CLI，以及 Web 上的「本地 / 当前工作树 / 新建工作树」弹层。本方案不包含 Skill，也不修改 DSH 核心。

> **状态：实验中，尚未发布。** 当前实现目标版本为 `@deepseek-ai/dsh@0.1.0-rc.6`。在完成真实 DSH profile 安装和 Web/Headless E2E 前，不应把本包描述为已兼容或可发布。

## 能力边界

- `/worktree status`：直接读取当前 Git 仓库与 worktree 状态，不经过模型。
- `/worktree new [可选分支]`：创建新分支和 linked worktree，并注册为 DSH Workspace；省略分支时使用当前 session id 生成 `dsh/<session-id>`。
- 裸 `/worktree`：Headless 返回状态；Web 使用 DSH 原生 `popupSelect` 显示「本地 / 当前工作树 / 新建工作树」，选中新建后切换到新 Workspace 会话。
- `worktree_create`：模型需要编排 Git 工作树时使用，返回供新会话使用的绝对 `cwd`。
- `dsh-worktree create`：从终端预先创建 worktree。
- `dsh-worktree archive`：按根目录 mtime 阈值预览或归档本包管理目录下的 linked worktree。
- Git 自身的 `git worktree list --porcelain -z` 是工作树事实源；DSH 自带 Workspace registry 只负责 Web/会话入口，本包不建立第二套台账。

本包不会创建 DSH session、复制未提交改动、fetch 远端、合并代码、删除分支、自动 prune 或配置定时任务。Web 弹层在用户选择成功时，由 DSH client-runtime 创建或复用目标 Workspace 的空白 session。精确放在「标准模式」右侧的常驻控件仍超出 rc.6 公开 slot 边界。

## 安装

开发期可从本地目录安装到 DSH profile：

```bash
dsh plugin --profile web add file:/absolute/path/to/dsh-plugins/packages/dsh-git-worktree
```

Headless 与 Web 都只装这一个包。安装后应使用 `dsh --dump-config` 确认 `dsh-git-worktree` bundle 行已经组合，并在 Web 中确认裸 `/worktree` 弹出命令弹层。

## 创建 worktree

创建新分支：

```bash
dsh-worktree create \
  --repo /path/to/repository \
  --branch suqing/my-task \
  --at HEAD
```

使用已有本地分支：

```bash
dsh-worktree create --repo /path/to/repository --existing my-branch
```

创建 detached worktree：

```bash
dsh-worktree create --repo /path/to/repository --detach --at HEAD
```

默认布局：

```text
~/.dsh/worktrees/<worktree-id>/<repo-name>/
```

命令返回 JSON，其中 `next.cwd` 是新 DSH 会话应选择的目录。`sourceDirty: true` 表示源仓库存在未提交修改；这些修改不会被复制。

DSH 工具 `worktree_create` 使用同一创建引擎。省略 `repository` 时，它读取当前会话不可变 header 中的 `cwd`。

host slash command 可直接输入：

```text
/worktree
/worktree status
/worktree new
/worktree new suqing/my-task
```

带参数命令始终直接执行，不发送给模型。`/worktree new` 省略分支时默认 `dsh/<session-id>`。

## 归档

默认只预览超过 7 天的候选项：

```bash
dsh-worktree archive --days 7
```

显式执行归档：

```bash
dsh-worktree archive --days 7 --apply
```

归档使用 `git worktree move`，不会降级成普通文件移动。locked、非 linked worktree、越界路径和不符合两层布局的目录不会移动。执行结果写入：

```text
~/.dsh/archived_worktrees/<timestamp>/manifest.jsonl
```

mtime 只是年龄启发式，不代表 DSH 会话最后活跃时间。本包不会自动运行归档。

归档后的 worktree 仍保持 Git 连接，可以直接在归档路径继续工作，或者使用 `git worktree move` 移回。确认代码已经妥善处理后，再由用户按 Git 原生命令移除 worktree；不要把 `git worktree prune` 当作常规删除命令。

## 配置

Bundle 默认配置等价于：

```yaml
- id: git-worktree
  name: 'dsh-git-worktree'
  config:
    baseDir: '~/.dsh/worktrees'
```

CLI 的归档根目录默认是 `~/.dsh/archived_worktrees`，可以通过 `--base-dir`、`--archive-dir` 覆盖。CLI 是独立进程，不读取 Cordis profile 配置。

## 开发验证

```bash
pnpm install
pnpm --filter dsh-git-worktree typecheck
pnpm --filter dsh-git-worktree test
pnpm --filter dsh-git-worktree build
```

这些命令只能证明类型、fixture、真实 Git worktree 操作、bundle 静态契约和 client bundle 形态，不能替代 DSH Web/Headless E2E。

发布前还必须确认：

1. `pnpm pack` 的 npm 包内容正确；
2. 包能安装进指定 DSH profile；
3. `dsh --dump-config` 包含插件行；
4. 真实会话可以执行 `/worktree status`、`/worktree new` 和 `worktree_create`；
5. Web 裸 `/worktree` 弹层可以创建 Workspace 并切换到新 session；
6. 新 session 可以在 worktree 内写入，而主 checkout 保持不变；
7. 归档及恢复在真实 linked worktree 上可用。

## 兼容性

- 目标 DSH：`0.1.0-rc.6`
- Node.js：`>=22`
- Git：需要支持 `git worktree move` 和 `git worktree list --porcelain -z`
- 已完成的验证和未完成的 E2E 必须分开记录；DSH developer preview 升级后需要重新验证。
