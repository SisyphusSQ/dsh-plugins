# @suqingsq/dsh-session-tools

English | [中文](README.zh.md)

Session tools for DeepSeek Harness. The package gives the model six session tools and integrates with the Host's native Web `@` references for sourced session context.

Compiled and package-tested against `@deepseek-ai/dsh@0.2.2-rc.1`, including a real Loader + AgentLoop + Session Controller composition. This is not a claim of Web or provider-backed E2E verification.

Requires DSH `>=0.2.2-rc.1 <0.3.0`, Cordis `~4.1.0`, and Node.js `>=24.9.0` for this source version. `read_session` sizes snapshots using the active model request and forwards its cancellation signal.

## Historical release

The command below installs the earlier release verified with DSH `0.1.0-rc.6`, not this unpublished source adaptation:

```bash
dsh plugin --profile web add @suqingsq/dsh-session-tools@0.2.0
```

Remove it with `dsh plugin --profile web remove @suqingsq/dsh-session-tools`.

## Tools

The tools run only on the current, running Root Agent driven by the Agent Loop. Subagents are rejected. Cross-session messages use `source.kind = "session-relay"` and are not disguised as direct user input.

| Tool | What it does |
| --- | --- |
| `list_sessions` | Lists ordinary session metadata (id, title, cwd). It does not search message bodies. Subagent-owned sessions are excluded. |
| `read_session` | Attaches a bounded, untrusted snapshot of another ordinary session to the current step. Tool calls, reasoning, internal context, and unfinished chunks are omitted. |
| `create_session` | Creates a real persisted session and an idle Agent through the Host API. Unless overridden, it validates and inherits the caller's effective cwd (including `cd` and directory recovery) and its agent preset. The new session is not prompted automatically. |
| `rename_session` | Renames the current session or another ordinary session through the same business API as the Web UI. |
| `fork_session` | With `at_seq`, copies the exact inclusive source-event prefix and synthetically closes an open tail; later source events are not copied. Without it, uses the latest completed-turn prefix. The Host preserves source history, directory changes, workspace, lineage, and title seed, and selects the new Agent's model. |
| `send_message_to_session` | Queues one follow-up turn on another ordinary session, waits for that session's current turn to finish, and returns delivery confirmation only. |

The public `createSessionToolDefinitions()` factory still accepts its original service shape. An optional `workingDirectory` service takes precedence; otherwise default-cwd creation uses the authenticated caller Agent's native Context service. With neither service, it fails explicitly instead of using a stale header or process cwd. An explicit `cwd` needs no directory service.

## `@` session mentions

The default Web path uses `@deepseek-ai/dsh-client-ui-reference`: its single `reference` provider combines file, folder, subagent, and session candidates. This package does not register another `session` group or its own pre-step mention adapter.

Picking a session creates the native session reference chip. The native codec preserves its canonical `@[title](dsh-session:…)` value for submission and clipboard operations. The Host's `sessionReferenceResolver` normalizes direct user mentions and places an untrusted, read-only sourced snapshot immediately after the citing message. Tools, reasoning, and internal context do not become reference content.

A human `@` mention does not go through `read_session` approval. Plain `@title` text alone is not a session reference. Model-initiated `read_session` still requires approval by default and uses `deferContext()`; snapshots are never promoted to direct-user authority.

The exported legacy `createSessionMentionSource` and `listSessionMentionCandidates` remain available for explicit consumers. The opt-in `injectMentionedSessionReferences` helper now requires the `modelSelection` captured by `agent/pre-step`, so reference budgets follow that step's route rather than a future model choice. The source/candidate factories are deprecated and are not mounted by the default package path; new integrations should use the native reference provider rather than register the legacy source alongside it.

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

Package regressions run against `@deepseek-ai/dsh@0.2.2-rc.1`. The credential-free Host composition exercises a full message → tool → reply flow with real session creation, effective-cwd inheritance, exact open-prefix forks, approval audit events, bounded sourced context, native mention preparation, and Loader unload cleanup. A separate published-client-entry fixture checks single-provider registration and native reference chip/codec behavior; it does not render a browser UI.

Earlier product verification is recorded in the [design document](https://github.com/SisyphusSQ/dsh-plugins/blob/main/docs/design/dsh-session-capabilities.md).

## License

[MIT](LICENSE)
