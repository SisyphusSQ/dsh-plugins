# Packages

English | [中文](README.zh.md)

Independently installable DeepSeek Harness plugins. Each package has its own README, tests, and verification record.

The released `0.2.0` set is verified with `@deepseek-ai/dsh@0.1.0-rc.6`. Repository source targets `@deepseek-ai/dsh@0.2.1-rc.2` and keeps an `engines.dsh` range that also admits `0.2.0-rc.2`. Five packages were retired on 2026-10-06; the table below lists the maintained set plus the experimental, unpublished `dsh-codex-bridge`.

| Package | What it does |
| --- | --- |
| [@suqingsq/dsh-ui-zoom](dsh-ui-zoom/README.md) | Whole-interface zoom for the Web and Desktop GUI, with a Settings row and a durable per-profile percentage |
| [@suqingsq/dsh-session-tools](dsh-session-tools/README.md) | Session list/read/create/rename/fork/relay tools and Web `@` session mentions |
| [@suqingsq/dsh-worktree-workspaces](dsh-worktree-workspaces/README.md) | Git worktree slash command, model tool, CLI, and Web picker |
| [@suqingsq/dsh-codex-bridge](dsh-codex-bridge/README.md) | Read-only Codex Home compatibility: skills, plugins, AGENTS instructions, agent-role delegation, credential-free MCP and hooks (experimental, unpublished) |

Collaboration and package-boundary rules are in [`AGENTS.md`](../AGENTS.md).
