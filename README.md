# dsh-plugins

English | [中文](README.zh.md)

Third-party plugins for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Each directory under `packages/` is an independently installable plugin.

Verified with `@deepseek-ai/dsh@0.1.0-rc.6`.

## Install

Requires Node.js 22 or later and `pnpm` on `PATH`. Install only the plugins you need into the DSH Web profile:

```bash
dsh plugin --profile web add @suqingsq/dsh-openai-codex-oauth@0.2.0
dsh plugin --profile web add @suqingsq/dsh-codex-login-dock@0.2.0
dsh plugin --profile web add @suqingsq/dsh-composer-skill-mention@0.2.0
dsh plugin --profile web add @suqingsq/dsh-session-tools@0.2.0
dsh plugin --profile web add @suqingsq/dsh-agent-plugins@0.2.0
dsh plugin --profile web add @suqingsq/dsh-thinking-collapse@0.2.0
dsh plugin --profile web add @suqingsq/dsh-worktree-workspaces@0.2.0
```

Each package is independently installable, except that the Codex login dock requires the OAuth package in the same profile. The commands pin the plugin release verified with DSH `0.1.0-rc.6`; the full scoped set has also been installed and loaded in the daily DSH `0.1.0-rc.7` Web profile.

The previous unscoped package names are deprecated. Replace them with the corresponding `@suqingsq/*@0.2.0` package.

## Plugins

### [@suqingsq/dsh-openai-codex-oauth](packages/dsh-openai-codex-oauth/README.md)

ChatGPT subscription OAuth for the native `openai-codex` route: credentials, refresh, slash commands, and silent browser login.

### [@suqingsq/dsh-codex-login-dock](packages/dsh-codex-login-dock/README.md)

Codex subscription login card above the composer, a persistent Settings page, and secret-free Host auth status.

### [@suqingsq/dsh-thinking-collapse](packages/dsh-thinking-collapse/README.md)

Codex-style activity rows in the Web chat view. Each turn folds thinking and ordinary tool calls into one timed row; inner thoughts keep the DSH Think row, and the answer stays outside.

![Collapsed thinking and tool activity](packages/dsh-thinking-collapse/screenshots/collapsed.png)

### [@suqingsq/dsh-composer-skill-mention](packages/dsh-composer-skill-mention/README.md)

Codex-style Skill mentions in the Web composer. Type `$` or fullwidth `￥` to pick a Skill; the host loads that Skill before the Agent step.

![Skill mention candidates](packages/dsh-composer-skill-mention/screenshots/mention.png)

### [@suqingsq/dsh-session-tools](packages/dsh-session-tools/README.md)

Six model-facing session tools, plus Web `@` candidates that inject another session as sourced context.

![Session mention candidates](packages/dsh-session-tools/screenshots/mention.png)

### [@suqingsq/dsh-agent-plugins](packages/dsh-agent-plugins/README.md)

An [Agent Plugins](https://github.com/agentplugins/agent-plugins-spec) adapter: CLI, skill/MCP registration, and a Web sidebar panel with plugin and component toggles.

![Agent Plugins panel](packages/dsh-agent-plugins/screenshots/panel.png)

### [@suqingsq/dsh-worktree-workspaces](packages/dsh-worktree-workspaces/README.md)

Create and archive Git linked worktrees. The same package exposes `/worktree`, a model tool, a CLI, and a Web picker that switches DSH Workspace.

![Git worktree picker](packages/dsh-worktree-workspaces/screenshots/picker.png)

## Repository

This is a pnpm workspace. Package conventions are in [AGENTS.md](AGENTS.md). The plugin index is in [`packages/README.md`](packages/README.md), and release history is tracked in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
