# @suqingsq/dsh-openai-codex-oauth

English | [中文](README.zh.md)

ChatGPT subscription OAuth for the `openai-codex` provider in DeepSeek Harness. Forked from [`dyuan311/dsh-openai-codex-oauth@0.1.1`](https://github.com/dyuan311/dsh-openai-codex-oauth) and maintained in this repository.

This package stores OAuth credentials, refreshes access tokens before Codex requests, and exposes `/codex-login`, `/codex-status`, and `/codex-logout`. It also provides a Host **silent browser login** face used by `dsh-codex-login-dock` so Settings and the session dock can finish PKCE without a composer question card and without writing `/codex-login` into the session log.

It does not register an LLM adapter. `@deepseek-ai/dsh-llm-pi-ai` stays the `openai-codex` route. PKCE, the callback server, and refresh stay in `@earendil-works/pi-ai`.

Host APIs target `@deepseek-ai/dsh@0.1.0-rc.6`. Fixture tests cover silent login, cancel, in-flight exclusion, port-busy mapping, and command registration. That is not a live DSH Web or Headless E2E.

## Install

```bash
dsh plugin --profile web add @suqingsq/dsh-openai-codex-oauth@0.2.0
```

Remove it with `dsh plugin --profile web remove @suqingsq/dsh-openai-codex-oauth`.

## Behavior

- Full OAuth JSON: `OPENAI_CODEX_OAUTH_CREDENTIAL`
- Current access token: `OPENAI_CODEX_ACCESS_TOKEN`
- Default file: `$DSH_HOME/.credentials.yaml`
- Browser PKCE callback: `http://localhost:1455/auth/callback`
- Does not read or write `~/.codex`

The bundle patch sets `openai-codex` `apiKeyEnv` to `OPENAI_CODEX_ACCESS_TOKEN` and `displayName` to `Codex 订阅`.

Silent `loginBrowser` opens the system browser on `auth_url`, waits for the local callback, and does not call `userQuestions`. `/codex-login` and `/codex-login device` still use the question composer.

## Commands

| Command | What it does |
| --- | --- |
| `/codex-login [browser\|device]` | Interactive OAuth. Browser waits in the composer question card. Device code stays on this command. |
| `/codex-status` | Shows credential state, source, and access-token expiry without secrets |
| `/codex-logout` | Clears the stored OAuth credential and access token |

## Host service

`ctx.openaiCodexOAuth`:

| Method | What it does |
| --- | --- |
| `loginBrowser(signal?)` | Silent browser PKCE. Opens the system browser. No session command log. |
| `logout()` | Clears both credential refs |

Web dock and Settings must call this face, not `/codex-login`.

## Configuration

| Field | Default | Meaning |
| --- | --- | --- |
| `oauthCredentialRef` | `OPENAI_CODEX_OAUTH_CREDENTIAL` | Full OAuth JSON credential |
| `refreshBeforeMs` | `300000` | Refresh this many milliseconds before access expiry |

## Acknowledgements

Fork baseline: [`dyuan311/dsh-openai-codex-oauth@0.1.1`](https://github.com/dyuan311/dsh-openai-codex-oauth) (MIT).

This package uses DeepSeek Harness [`@deepseek-ai/dsh-llm-pi-ai`](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/llm/llm-pi-ai) and [`@earendil-works/pi-ai`](https://github.com/earendil-works/pi/tree/main/packages/ai). Notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

[MIT](LICENSE)
