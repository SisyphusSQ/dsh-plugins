# dsh-plugins

A monorepo for composable [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) plugins.

> **Status:** Experimental development. No plugins have been published yet.

## 中文说明

本仓库用于维护可组合的 DeepSeek Harness（DSH）第三方插件。当前包含实验中的 `dsh-git-worktree` host 包及其 `dsh-git-worktree-web` companion，尚未发布任何插件。

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
- Experimental plugins: [`dsh-git-worktree`](packages/dsh-git-worktree/README.md) + [`dsh-git-worktree-web`](packages/dsh-git-worktree-web/README.md)
- Planned plugins: discussed separately before implementation

Public installation and release instructions will be added only after a plugin is validated against an explicit DSH version. Experimental packages may document local development installation separately.

## License

[MIT](LICENSE)
