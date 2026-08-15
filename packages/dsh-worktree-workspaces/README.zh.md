# dsh-worktree-workspaces

[English](README.md) | 中文

为 DeepSeek Harness 创建和归档 Git linked worktree。同一包提供 `/worktree` 斜杠命令、`worktree_create` 模型工具、`dsh-worktree` CLI，以及用于切换 DSH Workspace 的 Web 弹层。

已按 `@deepseek-ai/dsh@0.1.0-rc.6` 验证。

## 安装

需要 Node.js 22 或更高版本，并确保 `pnpm` 在 `PATH` 中：

```bash
dsh plugin --profile web add dsh-worktree-workspaces@0.1.0
```

卸载命令：`dsh plugin --profile web remove dsh-worktree-workspaces`。

## 做什么

Git 自身的 `git worktree list --porcelain -z` 是工作树事实源；DSH Workspace 只负责 Web/会话入口。本包不建立第二套台账。

![工作树选择器](screenshots/picker.png)

## `/worktree`

这些命令直接执行，不发送给模型。

| 输入 | 结果 |
| --- | --- |
| `/worktree status` | 打印仓库根目录、当前路径、分支和工作树数量。 |
| `/worktree new [分支]` | 创建新分支和 linked worktree，并注册为 DSH Workspace。省略分支时使用 `dsh/<session-id>`。 |
| `/worktree` | 在 Web 上打开 `popupSelect`：**本地**（原 checkout）、**工作树**（当前已在托管工作树里时）、**新建工作树**。选中「新建工作树」后创建工作树并切换到新的 Workspace 会话。Headless 则返回状态。 |

源仓库的未提交改动不会被复制。本包自己不会创建 DSH session；Web 上用户选择成功后，由 DSH client-runtime 为目标 Workspace 创建或复用空白 session。

## `worktree_create`

模型需要编排 Git 工作树时使用，返回供新会话使用的绝对 `cwd`。省略 `repository` 时读取当前会话 cwd。模式：

- `new-branch` — 新建本地分支（可选 `startPoint`，默认 `HEAD`）
- `existing-branch` — 检出已有本地分支
- `detached` — 在 `startPoint` 或 `HEAD` 上 detached HEAD

## CLI

```bash
dsh-worktree create --repo /path/to/repository --branch suqing/my-task --at HEAD
dsh-worktree create --repo /path/to/repository --existing my-branch
dsh-worktree create --repo /path/to/repository --detach --at HEAD
```

默认布局：

```text
~/.dsh/worktrees/<worktree-id>/<repo-name>/
```

命令返回 JSON。`next.cwd` 是新 DSH 会话应选择的目录。`sourceDirty: true` 表示源仓库存在未提交修改；这些修改不会被复制。

预览根目录 mtime 超过 7 天的候选项，再执行归档：

```bash
dsh-worktree archive --days 7
dsh-worktree archive --days 7 --apply
```

归档使用 `git worktree move`。locked、非 linked worktree、越界路径和不符合两层布局的目录不会移动。执行结果写入：

```text
~/.dsh/archived_worktrees/<timestamp>/manifest.jsonl
```

mtime 只是年龄启发式，不代表 DSH 会话最后活跃时间。CLI 不会自己定时跑。归档后的 worktree 仍保持 Git 连接，可以直接在归档路径继续工作，或用 `git worktree move` 移回。

CLI 是独立进程，不读取 Cordis profile 配置。`--base-dir`、`--archive-dir` 可覆盖默认的 `~/.dsh/worktrees` 和 `~/.dsh/archived_worktrees`。

## Bundle 配置

```yaml
- id: worktree-workspaces
  name: 'dsh-worktree-workspaces'
  config:
    baseDir: '~/.dsh/worktrees'
```

## 验证

兼容边界与验证证据记录在[设计文档](https://github.com/SisyphusSQ/dsh-plugins/blob/main/docs/design/dsh-worktree-workspaces.md)中。当前兼容基线为 `@deepseek-ai/dsh@0.1.0-rc.6`。

## License

[MIT](LICENSE)
