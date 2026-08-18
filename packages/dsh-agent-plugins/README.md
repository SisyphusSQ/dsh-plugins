# @suqingsq/dsh-agent-plugins

English | [中文](README.zh.md)

An [Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec) adapter for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). One package covers the host bundle, a Web sidebar panel, and the `agent-plugins` CLI.

Verified with `@deepseek-ai/dsh@0.1.0-rc.6`.

## Install

```bash
dsh plugin --profile web add @suqingsq/dsh-agent-plugins@0.2.0
```

Remove it with `dsh plugin --profile web remove @suqingsq/dsh-agent-plugins`.

## What it does

DSH can consume standard Agent Plugin packages (`plugin.json` + `skills/` + `mcp.json`):

- Skills under `skills/<name>/SKILL.md` are registered into DSH's Skill registry (provider `agent-plugins`).
- `mcp.json` servers are mapped into the managed home patch so DSH starts them as MCP rows.
- The CLI installs, updates, enables, and removes packages in a machine-level store.
- The Web sidebar **插件** button opens a panel over the session list: plugin cards, skill/MCP toggles, filters, and the CLI cheat sheet.

![Agent Plugins panel](screenshots/panel.png)

## Store

Packages live in `$DSH_HOME/agent-plugins/`. The ledger is `installed.json`, with plugin-level `enabled` plus component-level `skills.*.enabled` and `mcp.*.enabled` (both default to true). The CLI, host adapter, and panel share the same library.

A disabled plugin hides all of its skills and MCP servers. Disabling one skill or one MCP server leaves the rest of the package running.

## CLI

```text
agent-plugins install <dir|zip|git-url>
agent-plugins uninstall <name>
agent-plugins update [name...|--all]
agent-plugins enable|disable <name>
agent-plugins enable|disable <name> --skill <n>
agent-plugins enable|disable <name> --mcp <server>
agent-plugins list [--json]
agent-plugins doctor
```

`install` validates the package before writing the store. Reinstalling the same `name` replaces the files and keeps `PLUGIN_DATA`. `uninstall` removes files and ledger rows and keeps `PLUGIN_DATA`. `--mcp` uses the qualified server name `<plugin>__<server>` shown by `list`.

`doctor` checks the store, ledger, and managed patch section.

## Panel

The footer action opens `shell.overlay` over the session column. The panel lists machine-level and project-level (`.agent-plugins`) stores, filters by name or source (`dir` / `zip` / `git`), and toggles a whole plugin or a single skill / MCP server. Expanding a card shows source, author, install time, checksum, data directory, and component switches.

Project skills are discovered from `cwd/.agent-plugins` and the project-root `.agent-plugins` directory.

## Verification

The compatibility boundary and verification evidence are recorded in the [design document](https://github.com/SisyphusSQ/dsh-plugins/blob/main/docs/design/dsh-agent-plugins.md). The current compatibility baseline is `@deepseek-ai/dsh@0.1.0-rc.6`.

## License

MIT.
