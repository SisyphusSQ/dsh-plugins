# Codex Home bridge

[中文](<README.zh.md>)

A read-only Codex Home importer for DeepSeek Harness. It discovers Home-owned configuration; it does not read credential stores, copy sessions or state databases, write Codex Home, or run the Codex CLI. MCP connections use the native DSH client; authentication is configured independently in DSH.

## Controls

The bridge is disabled by default. Its settings page provides a Home path (default `CODEX_HOME` or `~/.codex`) and whole-category controls:

- Global instructions: first nonempty `AGENTS.override.md` or `AGENTS.md`, bounded by the configured byte budget.
- Skills: standalone Home skills.
- Plugins: explicitly enabled, unambiguously selected cached plugins, including their skills.
- Agents: Home TOML roles and Home-contained configured role files.
- MCP connections and hooks execution: independent grants, both disabled by default. Enabling them in the settings page requires confirmation.

There are no per-skill or per-plugin toggles. Plugin-owned skills follow Plugins, not Skills. Settings use DSH's persisted config forms. The page groups bridge/directory settings, imported content, execution grants and read-only diagnostics, using Host theme tokens. Directory edits are saved explicitly with **Save directory** or Enter; switches and directory values follow Host confirmation. Loading, read-only, saving and failed states remain visible. Diagnostics distinguish unread, loading, failed and ready snapshots, with counts, scan time and expandable details; counts are not connection-health or execution-success indicators. Diagnostics exclude instruction bodies, commands, environment values and headers.

## Runtime features

Skills retain invocation policies and directory resources, with stable DSH names and mapped original identities. Known namespaced skill references are translated in memory. Global instruction revisions and retractions deduplicate against admitted visible session messages.

`codex_home_catalog` reports role policy compatibility, skill mappings and safe diagnostics. `codex_agent` runs an imported role as a real one-shot DSH subagent using the parent composition. The read-only catalog requires the tools service, not a model or subagent service. Delegation requires a live parent Agent, the llm/subagents services and a registered `spawn` provider with a concrete Agent implementation; a registry seam alone does not execute children. Model overrides require an existing DSH provider route. Each delegation reads the current DSH `subagents.maxDepth` once, enforces it before model lookup and passes that same limit to activation; zero disables child delegation. Persisted parent depth cannot be lowered by fresh runtime options. Unsupported role policies/configuration are rejected before starting a child. Category changes cancel owned work; unload aborts and drains it.

Authorized credential-free MCP uses the public DSH MCP client for stdio and Streamable HTTP, with stable namespaces, plugin-root substitution and tool timeouts. Entries containing authentication, headers or explicit environment configuration are blocked before opening a connection and report that independent DSH configuration is required. No Codex OAuth grant, credential reference or helper is read or evaluated. DSH owns independently configured authentication; disabling the imported category closes only bridge-owned connections and unregisters their tools. Authorized synchronous command hooks use DSH's shell and hook protocol for SessionStart, UserPromptSubmit, PreToolUse, PostToolUse and Stop. Unsupported execution configuration is not run. Hook revocation blocks new hook work and discards revoked hook output; ownership polling cancels pending hooks.

Executable components are trusted local programs running with DSH privileges. Read-only import is not an execution sandbox. The importer does not provide Codex model-login authentication or override DSH permissions.

## Verification

Compilation and credential-free regressions target DSH **0.2.1-rc.5** APIs. `@deepseek-ai/dsh-hook-protocol` ships as a runtime dependency. Built-entry tests cover parsing, category controls, settings writes, ownership races, protocol framing and actual Gateway discovery. macOS fixtures use the target shell/subprocess providers to verify hook parent/child cancellation. Native MCP checks exercise the target stdio/HTTP transports and the Loader bridge entry against loopback fixtures, with reviewed schema/wire/result snapshots. They verify that a fake Codex grant is ignored, auth-bearing imports open no connection, and an independently authenticated native DSH connection survives bridge removal. Depth regressions cover zero, exhausted and exceeded caps, legal boundary starts, volatile configuration changes and one captured limit across model lookup. A Loader composition exercises the native subagent service; the opt-in native-role scenario additionally uses the exact rc.5 Agent loop and in-process spawn provider with a scripted model, checking depth denial, inherited child depth, result delivery and unload cancellation. These are credential-free composition checks, not real-provider or product-entry E2E.

Historical rc.2 CLI/Headless verification completed a credential-free parent/child turn with a scripted LLM. A prior artifact was verified in the daily Desktop profile for catalog calls, global instructions, category switches and standalone/plugin-owned skill loading; those historical checks are not rc.5 product-runtime verification.

See the [compatibility and verification record](<lib/compatibility.md>) for semantic boundaries and outstanding coverage.
