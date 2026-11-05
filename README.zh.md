# dsh-plugins

[English](README.md) | 中文

[DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 的第三方插件仓库。`packages/` 下每个目录都是一个可独立安装的插件。

已发布的 `0.2.0` 集合按 `@deepseek-ai/dsh@0.1.0-rc.6` 验证。仓库源码目标为 DSH `0.2.2-rc.1`、Cordis `4.1.0`、Node.js `>=24.9.0`，不再声明支持旧 DSH cohort；验证范围见[兼容记录](docs/design/dsh-0.2.2-migration.md)。2026-10-06 退役了五个包：`dsh-agent-plugins`、`dsh-thinking-collapse`、`dsh-codex-login-dock`、`dsh-openai-codex-oauth`、`dsh-composer-skill-mention`；2026-11-04 又退役了 `dsh-worktree-workspaces`。下列两个包是保留维护集；该源码集合尚未发布。仓库另有一个已纳入版本管理的实验性包 [`dsh-codex-bridge`](packages/dsh-codex-bridge/README.zh.md)（只读 Codex Home 兼容），既未发布，也不属于上述维护集。

## 安装

以下历史已发布版本需要 Node.js 22 或更高版本，并确保 `pnpm` 在 `PATH` 中；它不是当前 DSH `0.2.2-rc.1` 源码适配版。按需安装到与该版本匹配的 DSH Web profile：

```bash
dsh plugin --profile web add @suqingsq/dsh-session-tools@0.2.0
```

每个包都可以独立安装。以上命令固定到已按 DSH `0.1.0-rc.6` 验证的插件版本；退役前，完整 scoped 包集合也曾在日常 DSH `0.1.0-rc.7` Web profile 中完成安装与加载回读。`dsh-ui-zoom` 尚未发布，因此不提供安装命令。

旧 unscoped 包名已经弃用；对应已退役包的 scoped 版本不再维护。

## 插件

### [@suqingsq/dsh-session-tools](packages/dsh-session-tools/README.zh.md)

六个模型侧会话工具，以及 Web `@` 会话候选：选中后把另一会话作为带出处的上下文注入本轮。

![会话提及候选](packages/dsh-session-tools/screenshots/mention.png)

### [@suqingsq/dsh-ui-zoom](packages/dsh-ui-zoom/README.zh.md)

Web 与桌面端的整体界面缩放：设置页「整体界面缩放」行（−/+ 与重置），以及可按 profile 持久化的缩放百分比。尚未发布。

## 仓库

本仓库是 pnpm workspace。包约定见 [AGENTS.md](AGENTS.md)。插件索引见 [`packages/README.md`](packages/README.md)，版本历史见 [CHANGELOG.md](CHANGELOG.md)。

## License

[MIT](LICENSE)
