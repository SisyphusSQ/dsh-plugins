# dsh-session-tools

English | [中文](README.zh.md)

Session tools for DeepSeek Harness. One package gives the model six session tools, and gives the Web composer `@` session candidates that inject another session as sourced context.

Verified with `@deepseek-ai/dsh@0.1.0-rc.6`.

## Install

Requires Node.js 22 or later and `pnpm` on `PATH`:

```bash
dsh plugin --profile web add dsh-session-tools@0.1.0
```

Remove it with `dsh plugin --profile web remove dsh-session-tools`.

## Tools

The tools run only on the current, running Root Agent driven by the Agent Loop. Subagents are rejected. Cross-session messages use `source.kind = "session-relay"` and are not disguised as direct user input.

| Tool | What it does |
| --- | --- |
| `list_sessions` | Lists ordinary session metadata (id, title, cwd). It does not search message bodies. Subagent-owned sessions are excluded. |
| `read_session` | Attaches a bounded, untrusted snapshot of another ordinary session to the current step. Tool calls, reasoning, internal context, and unfinished chunks are omitted. |
| `create_session` | Creates a real persisted session and an idle Agent through the Host API. It inherits cwd and agent preset unless you override them. The new session is not prompted automatically. |
| `rename_session` | Renames the current session or another ordinary session through the same business API as the Web UI. |
| `fork_session` | Forks an ordinary session at a completed turn boundary, inheriting cwd, model target, workspace, lineage, and title seed. |
| `send_message_to_session` | Queues one follow-up turn on another ordinary session, waits for that session's current turn to finish, and returns delivery confirmation only. |

## `@` session mentions

The Web composer `@` menu gains a `session` group of ordinary sessions. The current session and subagent sessions are excluded. Sessions that share the current cwd are ranked first.

Picking a candidate inserts `@[title](dsh-session:…)`. On `agent/pre-step`, the host parses those mentions, calls `sessionReferenceResolver.prepare()`, and places the untrusted snapshot ahead of this step's messages.

A human `@` mention does not go through `read_session` approval. Typing `@title` as plain text does not inject; the draft must contain the markdown mention (or a pasted canonical `dsh-session:` URI). If `read_session` already attached the same `sessionId` in this step, the mention is not prepared again.

![Session mention candidates](screenshots/mention.png)

## Configuration

These fields live on the `session-tools` Cordis row `config`:

| Field | Default | Meaning |
| --- | --- | --- |
| `approveRead` | `true` | Ask before attaching another session's snapshot |
| `approveCreate` | `true` | Ask before creating a session |
| `approveRenameCurrent` | `false` | Ask before renaming the current session |
| `approveRenameOther` | `true` | Ask before renaming another session |
| `approveFork` | `true` | Ask before forking |
| `approveSend` | `true` | Ask before relaying a message |

Only `allowed-once` continues an approval request; any other answer fails closed.

## Verification

The compatibility boundary and verification evidence are recorded in the [design document](https://github.com/SisyphusSQ/dsh-plugins/blob/main/docs/design/dsh-session-capabilities.md). The current compatibility baseline is `@deepseek-ai/dsh@0.1.0-rc.6`.

## License

[MIT](LICENSE)
