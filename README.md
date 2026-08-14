# dsh-plugins

A monorepo for composable [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) plugins.

> **Status:** Experimental plugin development. No plugins have been published yet.

## 中文说明

本仓库用于维护可组合的 DeepSeek Harness（DSH）第三方插件。当前已有可从源码构建和本地安装的实验包，但尚未发布稳定插件。

后续每个稳定能力将作为 `packages/` 下的独立包开发：既可以单独安装，也可以在确有需要时由聚合包组合安装。README 会始终区分已发布、实验中和计划中的内容。

## Workspace

```text
.
├── packages/            # Independently installable plugin packages
├── AGENTS.md            # Repository collaboration and package conventions
├── package.json         # Private workspace manifest
├── pnpm-workspace.yaml  # Workspace package discovery
└── tsconfig.base.json   # Shared TypeScript baseline
```

Package requirements and future contribution boundaries are documented in [`packages/README.md`](packages/README.md).

## Development status

- Published plugins: none
- Experimental plugins: `dsh-thinking-collapse`（可从源码构建并本地安装，已完成 DSH `0.1.0-rc.6` live Web E2E，尚未发布）
- Planned plugins: discussed separately before implementation

The design of the first experimental package is documented in
[`docs/design/dsh-thinking-collapse.md`](docs/design/dsh-thinking-collapse.md).

The experimental package README documents local build and profile installation. Release instructions will be added only after validation against the declared DSH version.

## License

[MIT](LICENSE)
