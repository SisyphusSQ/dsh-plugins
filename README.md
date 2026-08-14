# dsh-plugins

A monorepo for composable [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) plugins.

> **Status:** Repository scaffold only. No installable plugins have been published yet.

## 中文说明

本仓库用于维护可组合的 DeepSeek Harness（DSH）第三方插件。当前只建立 monorepo 工作区和包约定，尚未提供任何可安装插件。

后续每个稳定能力将作为 `packages/` 下的独立包开发：既可以单独安装，也可以在确有需要时由聚合包组合安装。README 会始终区分已发布、实验中和计划中的内容。

## Workspace

```text
.
├── packages/            # Future independently installable plugin packages
├── AGENTS.md            # Repository collaboration and package conventions
├── package.json         # Private workspace manifest
├── pnpm-workspace.yaml  # Workspace package discovery
└── tsconfig.base.json   # Shared TypeScript baseline
```

Package requirements and future contribution boundaries are documented in [`packages/README.md`](packages/README.md).

## Development status

- Available plugins: none
- Experimental plugins: none
- Planned plugins: discussed separately before implementation

Installation and release instructions will be added only after the first plugin is implemented and validated against an explicit DSH version.

## License

[MIT](LICENSE)
