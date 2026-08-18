# dsh-codex-login-dock

English | [中文](README.zh.md)

Session login card, Settings page, and Host auth status for Codex subscription in DeepSeek Harness. It does not register an LLM adapter and does not implement PKCE, refresh, or a second credential store.

When the native model selector is on `openai-codex` (display name `Codex 订阅`) and credentials are not ready, a card appears above the composer. Settings also has a **Codex 订阅** section that stays visible after sign-in. The primary path is silent browser PKCE through `dsh-openai-codex-oauth`. After sign-in the session card disappears and the rest of the session stays native DSH.

Host and Web client APIs target `@deepseek-ai/dsh@0.1.0-rc.6`. Fixture tests cover status, silent login, logout, cancel, port-busy mapping, redaction, dock visibility, composer block, and the Settings section. That is not a live DSH Web or Headless E2E.

## Requires

Install [`dsh-openai-codex-oauth`](../dsh-openai-codex-oauth/README.md) from this repository in the same profile. This package looks up `ctx.openaiCodexOAuth` at runtime. If that silent face is missing, status is `missingPlugin` and browser login is not started. Sign-out calls `logout()` on the same face.

OAuth JSON lives in `OPENAI_CODEX_OAUTH_CREDENTIAL`. The current access token lives in `OPENAI_CODEX_ACCESS_TOKEN`. Default file is `$DSH_HOME/.credentials.yaml`. This package never writes `~/.codex`.

## Web

The card uses `conversation.input.dock`. It does not occupy `conversation.input.model` and does not draw a model selector.

| State | Card | Composer |
| --- | --- | --- |
| Signed out | Title `Codex 订阅需要登录`; primary `打开浏览器登录`; secondary `稍后` | Send is blocked; the model seat stays clickable |
| Authorizing | Title `正在等待浏览器授权`; primary `取消` | Send stays blocked |
| Expired / error | Title `登录已过期` or `Codex 订阅登录失败`; primary `重新登录` | Send stays blocked; error code stays visible |
| Missing OAuth plugin | Title `未安装 OAuth 插件`; no login button | Send stays blocked |
| Ready, or another provider | Card is not rendered | Send is not blocked by this plugin |

`稍后` hides the card and keeps the send block. Switching away from `openai-codex` hides the card and clears the block.

Settings registers an independent `settings.section` named `Codex 订阅`. It is not nested under the native Models row. The page stays visible when connected.

| State | Settings page |
| --- | --- |
| Signed out | Title `Codex 订阅需要登录`; primary `打开浏览器登录`; no `稍后` |
| Authorizing | Title `正在等待浏览器授权`; primary `取消` |
| Expired / error | Title `登录已过期` or `Codex 订阅登录失败`; primary `重新登录` |
| Missing OAuth plugin | Title `未安装 OAuth 插件`; no login button |
| Ready | Title `Codex 订阅已连接`; primary `退出登录` |

Settings and dock login stay on their own surfaces. They do not run `/codex-login`, do not replace the composer with a question card, and do not require a live agent.

## Commands

| Command | What it does |
| --- | --- |
| `/codex-auth-status` | Prints a secret-free snapshot: signed out, authorizing, ready, expired, missing plugin, or error |
| `/codex-auth-login` | Starts silent browser PKCE through `ctx.openaiCodexOAuth` |
| `/codex-auth-cancel` | Aborts an in-flight browser login |
| `/codex-auth-logout` | Clears credentials through `ctx.openaiCodexOAuth` |

The OAuth plugin still owns `/codex-login`, `/codex-status`, and `/codex-logout`. `/codex-login` remains the interactive slash path and may still show a question card. This package does not replace those commands.

The Web card and Settings page call the same Host face through `codexLoginDock/status`, `codexLoginDock/login`, `codexLoginDock/cancel`, and `codexLoginDock/logout`. Command text, RPC payloads, and snapshots omit access tokens, refresh tokens, JWTs, and account ids. Access expiry may be included as a timestamp.

## Configuration

These fields live on the `codex-login-dock` Cordis row `config`:

| Field | Default | Meaning |
| --- | --- | --- |
| `oauthCredentialRef` | `OPENAI_CODEX_OAUTH_CREDENTIAL` | Full OAuth JSON credential |
| `accessTokenRef` | `OPENAI_CODEX_ACCESS_TOKEN` | Current access token credential |

`displayName: Codex 订阅` and `apiKeyEnv: OPENAI_CODEX_ACCESS_TOKEN` come from the OAuth plugin patch so this overlay cannot drop the token env.

## License

[MIT](LICENSE)
