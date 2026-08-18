# dsh-worktree-workspaces 设计与验证记录

- 状态：已完成 rc.6 实现与隔离 profile 验证；`dsh-worktree-workspaces@0.1.0` 于 2026-08-15 首发，当前 `@suqingsq/dsh-worktree-workspaces@0.2.0` 已发布并在日常 rc.7 Web profile 中激活
- 目标包：`dsh-worktree-workspaces`
- 验证基线：`@deepseek-ai/dsh@0.1.0-rc.6`
- 记录日期：2026-08-15

## 目标

为 DeepSeek Harness 提供一套单包、可卸载的 Git linked worktree 能力：

- `/worktree` host 斜杠命令；
- `worktree_create` 模型工具；
- `dsh-worktree` 独立 CLI；
- Web `popupSelect` 工作树选择器与 Workspace 切换。

插件以 `git worktree list --porcelain -z` 为工作树事实源。DSH Workspace 只负责 Web 与会话入口，不建立第二套工作树台账。

## 交付边界

- 新建模式支持新分支、已有本地分支和 detached HEAD。
- 源 checkout 的未提交改动不会复制到新 worktree。
- 插件不会 fetch、merge、删除分支、自动 prune 或配置定时任务。
- host 不直接创建 DSH session；Web 选择成功后由 DSH client-runtime 创建或复用目标 Workspace 的空白 session。
- 归档使用 `git worktree move`，只处理插件托管根目录下符合两层布局的 linked worktree。
- locked、非 linked、越界路径和布局不匹配的候选失败关闭，不降级成普通文件移动。

## 自动验证入口

仓库测试覆盖：

- Git 仓库与 worktree 状态解析；
- 新分支、已有分支和 detached worktree 创建；
- session header cwd 与默认分支命名契约；
- `/worktree` host 命令和 `worktree_create` 工具协议；
- 归档候选、路径围栏、preview/apply 与 manifest；
- bundle 静态契约和 Web client bundle 入口。

对应入口位于 [`packages/dsh-worktree-workspaces/tests/`](../../packages/dsh-worktree-workspaces/tests/)。

## rc.6 profile 验证记录

在隔离的 DSH `0.1.0-rc.6` profile 中已验证：

1. 本地包可以安装为 profile bundle，组合配置包含 `dsh-worktree-workspaces` 行；
2. `/worktree status` 返回真实仓库、分支和 worktree 状态；
3. `/worktree new` 与 `worktree_create` 创建真实 linked worktree，并返回新会话可使用的绝对 cwd；
4. Web 裸 `/worktree` 打开选择器，能够选择本地 checkout 或新建工作树，并切换到对应 Workspace；
5. 新 Workspace 会话在 linked worktree 中工作，源 checkout 的未提交状态不被复制或改写；
6. 归档 preview、apply 和 `git worktree move` 恢复路径在真实 linked worktree 上可用。

Web 选择器的当前界面证据见 [`picker.png`](../../packages/dsh-worktree-workspaces/screenshots/picker.png)。自动验证、构建或配置 dump 不能单独替代上述真实 profile 验证。

## 兼容与发布边界

- 当前只声明兼容 `@deepseek-ai/dsh@0.1.0-rc.6`。
- DSH developer preview 升级后，必须重新核对命令、工具、Workspace 与 client-runtime 契约，并重做真实 profile 验证。
- 2026-08-15 已完成 npm tarball 内容、registry 安装和 registry 版本回读；GitHub Release 以同一 `v0.1.0` tag 记录首发结果。
- 2026-08-18 已完成 scoped 包迁移、registry tar 内容回读与日常 rc.7 Web profile 加载回读；旧 unscoped 包已弃用并指向 `@suqingsq/dsh-worktree-workspaces@0.2.0`。
