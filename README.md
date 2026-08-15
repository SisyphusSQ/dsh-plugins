# dsh-plugins

A monorepo for composable [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) plugins.

> **Status:** Experimental development. Five installable packages are implemented locally; no plugin has been published yet.

## 中文说明

本仓库用于维护可组合的 DeepSeek Harness（DSH）第三方插件。当前已有五个可打包安装、但尚未发布的实验包；发布状态与本地实现状态严格分开记录。

后续每个稳定能力将作为 `packages/` 下的独立包开发：既可以单独安装，也可以在确有需要时由聚合包组合安装。README 会始终区分已发布、实验中和计划中的内容。

## Workspace

```text
.
├── docs/design/         # Plugin design and compatibility decisions
├── packages/            # Independently installable plugin packages
├── AGENTS.md            # Repository collaboration and package conventions
├── package.json         # Private workspace manifest
├── pnpm-workspace.yaml  # Workspace package discovery
└── tsconfig.base.json   # Shared TypeScript baseline
```

Package requirements and future contribution boundaries are documented in [`packages/README.md`](packages/README.md).

## Development status

- 已发布插件：无
- 实验中：[`dsh-agent-plugins`](packages/dsh-agent-plugins/README.md)——Agent Plugins 标准包适配，待真实 profile 验收，尚未发布
- 实验中：[`dsh-composer-skill-mention`](packages/dsh-composer-skill-mention/README.md)——为 DSH Web composer 增加 `$` / `￥` Skill 提及，仅验证 rc.6，尚未发布
- 实验中：[`dsh-session-tools`](packages/dsh-session-tools/README.md)——六个模型侧会话工具与 Web `@会话` 提及，已完成 rc.6 隔离 profile Live E2E，尚未发布
- 实验中：[`dsh-thinking-collapse`](packages/dsh-thinking-collapse/README.md)——聊天视图的 Codex 式思考与工具调用折叠，已完成 DSH `0.1.0-rc.6` 隔离 profile live Web E2E，尚未发布
- 实验中：[`dsh-git-worktree`](packages/dsh-git-worktree/README.md)——Git worktree host 命令、模型工具、CLI 与 Web Workspace 弹层，尚未发布
- 计划中：分屏仍依赖尚未公开的 DSH Core 多会话渲染 API，就绪后落在 [`dsh-session-tools`](packages/dsh-session-tools/README.md)，见[设计](docs/design/dsh-session-capabilities.md)

实验包的本地安装、配置和证据边界见各自 README。只有完成发布前验证后，才会增加 registry 安装命令和 Release。

## License

[MIT](LICENSE)
