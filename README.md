# dsh-plugins

A monorepo for composable [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) plugins.

> **Status:** Four installable experimental packages are implemented locally. No plugin has been published yet.

## 中文说明

本仓库用于维护可组合的 DeepSeek Harness（DSH）第三方插件。当前已有四个可打包安装、但尚未发布的实验包；发布状态与本地实现状态严格分开记录。

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
- 实验中：[`dsh-session-tools`](packages/dsh-session-tools/README.md)——六个模型侧会话工具，已完成 rc.6 隔离 profile 安装与真实模型 Live E2E，尚未发布
- 实验中：[`dsh-thinking-collapse`](packages/dsh-thinking-collapse/README.md)——聊天视图的 Codex 式思考折叠，已完成 DSH `0.1.0-rc.6` 隔离 profile live Web E2E，尚未发布
- 计划中：`dsh-session-split-view` 与 `dsh-session-reference-web`——依赖尚未公开的 DSH Core 多会话渲染/提交扩展 API，当前只有[设计](docs/design/dsh-session-capabilities.md)

实验包的本地安装、配置和证据边界见各自 README。只有完成发布前验证后，才会增加 registry 安装命令和 Release。

## License

[MIT](LICENSE)
