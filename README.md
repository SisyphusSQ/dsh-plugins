# dsh-plugins

A monorepo for composable [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) plugins.

> **Status:** One experimental plugin is under development. No plugin has been published yet.

## 中文说明

本仓库用于维护可组合的 DeepSeek Harness（DSH）第三方插件。当前已有一个实验包进入本地实现与验证阶段，但尚未发布稳定版本。

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

- Published plugins: none
- Experimental plugins: [`dsh-composer-skill-mention`](packages/dsh-composer-skill-mention/README.md)（仅验证 DSH `0.1.0-rc.6`）
- Planned plugins: discussed separately before implementation

实验包的本地安装和验证方式记录在各自 README；完成真实 DSH 验证并明确兼容边界前不创建 Release。

## License

[MIT](LICENSE)
