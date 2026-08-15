# dsh-git-worktree-web

`dsh-git-worktree` 的 Web companion。它使用 DSH rc.6 原生 `/worktree` slash command 与 `popupSelect`，在不修改 DSH 核心的前提下提供“本地 / 当前工作树 / 新建工作树”入口，并在创建成功后切换到新 Workspace。

> **状态：实验中，尚未发布。** 目标版本为 `@deepseek-ai/dsh@0.1.0-rc.6`。

本包不实现 Git 操作，也不包含 Skill、React 面板或自定义 CSS；host 能力由 `dsh-git-worktree` 提供。Web profile 必须同时安装两个包：

```bash
dsh plugin --profile web add file:/absolute/path/to/dsh-plugins/packages/dsh-git-worktree
dsh plugin --profile web add file:/absolute/path/to/dsh-plugins/packages/dsh-git-worktree-web
```

安装后，在输入框输入裸 `/worktree` 或从 `/` 菜单选择它即可打开 DSH 原生弹层；带参数的 `/worktree status`、`/worktree new [branch]` 仍直接交给 host 命令执行。

兼容边界：精确放在“标准模式”右侧的常驻控件仍需要 DSH 新增公开 slot。本包只使用当前公开的命令 UI 与 Workspace API。
