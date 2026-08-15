# dsh-plugins

English | [中文](README.zh.md)

Third-party plugins for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Each directory under `packages/` is an independently installable plugin.

Verified with `@deepseek-ai/dsh@0.1.0-rc.6`.

## Install

Requires Node.js 22 or later and `pnpm` on `PATH`. Install only the plugins you need into the DSH Web profile:

```bash
dsh plugin --profile web add dsh-thinking-collapse@0.1.0
dsh plugin --profile web add dsh-composer-skill-mention@0.1.0
dsh plugin --profile web add dsh-session-tools@0.1.0
dsh plugin --profile web add dsh-agent-plugins@0.1.0
dsh plugin --profile web add dsh-worktree-workspaces@0.1.0
```

Each package is independently installable. The commands pin the plugin release verified with DSH `0.1.0-rc.6`.

## Plugins

### [dsh-thinking-collapse](packages/dsh-thinking-collapse/README.md)

Codex-style activity rows in the Web chat view. Each model step folds thinking and ordinary tool calls into one timed row; the answer stays outside.

![Collapsed thinking and tool activity](packages/dsh-thinking-collapse/screenshots/collapsed.png)

### [dsh-composer-skill-mention](packages/dsh-composer-skill-mention/README.md)

Codex-style Skill mentions in the Web composer. Type `$` or fullwidth `￥` to pick a Skill; the host loads that Skill before the Agent step.

![Skill mention candidates](packages/dsh-composer-skill-mention/screenshots/mention.png)

### [dsh-session-tools](packages/dsh-session-tools/README.md)

Six model-facing session tools, plus Web `@` candidates that inject another session as sourced context.

![Session mention candidates](packages/dsh-session-tools/screenshots/mention.png)

### [dsh-agent-plugins](packages/dsh-agent-plugins/README.md)

An [Agent Plugins](https://github.com/agentplugins/agent-plugins-spec) adapter: CLI, skill/MCP registration, and a Web sidebar panel with plugin and component toggles.

![Agent Plugins panel](packages/dsh-agent-plugins/screenshots/panel.png)

### [dsh-worktree-workspaces](packages/dsh-worktree-workspaces/README.md)

Create and archive Git linked worktrees. The same package exposes `/worktree`, a model tool, a CLI, and a Web picker that switches DSH Workspace.

![Git worktree picker](packages/dsh-worktree-workspaces/screenshots/picker.png)

## Repository

This is a pnpm workspace. Package conventions are in [AGENTS.md](AGENTS.md). The plugin index is in [`packages/README.md`](packages/README.md).

## License

[MIT](LICENSE)
