# dsh-codex-login-dock

English | [中文](README.zh.md)

Session login card, Settings page, and Host auth status for Codex subscription in DeepSeek Harness. It does not register an LLM adapter and does not implement PKCE, refresh, or a second credential store.

When the native model selector is on `openai-codex` (display name `Codex 订阅`) and credentials are not ready, a card appears above the composer. Settings also has a **Codex 订阅** section that stays visible after sign-in. The primary path is browser PKCE. After sign-in the session card disappears and the rest of the session stays native DSH.

Host and Web client APIs target `@deepseek-ai/dsh@0.1.0-rc.6`. Fixture tests cover status, login delegation, logout, cancel, live-agent fallback, port-busy mapping, redaction, dock visibility, composer block, and the Settings section. That is not a live DSH Web or Headless E2E.

## Requires

Install [`dsh-openai-codex-oauth`](https://github.com/dyuan311/dsh-openai-codex-oauth) in the same profile. This package looks up `/codex-login` at runtime. If that command is missing, status is `missingPlugin` and browser login is not started. Sign-out delegates to `/codex-logout` on that plugin.

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

If no live agent exists, login and logout fail with a visible error instead of pretending to succeed. Status uses the current session when it is live, otherwise any live agent.

## Commands

| Command | What it does |
| --- | --- |
| `/codex-auth-status` | Prints a secret-free snapshot: signed out, authorizing, ready, expired, missing plugin, or error |
| `/codex-auth-login` | Delegates to `/codex-login browser` on the OAuth plugin |
| `/codex-auth-cancel` | Aborts an in-flight browser login |
| `/codex-auth-logout` | Delegates to `/codex-logout` on the OAuth plugin |

The OAuth plugin still owns `/codex-login`, `/codex-status`, and `/codex-logout`. This package does not replace those commands.

The Web card and Settings page call the same Host face through `codexLoginDock/status`, `codexLoginDock/login`, `codexLoginDock/cancel`, and `codexLoginDock/logout`. Command text, RPC payloads, and snapshots omit access tokens, refresh tokens, JWTs, and account ids. Access expiry may be included as a timestamp.

## Configuration

These fields live on the `codex-login-dock` Cordis row `config`:

| Field | Default | Meaning |
| --- | --- | --- |
| `oauthCredentialRef` | `OPENAI_CODEX_OAUTH_CREDENTIAL` | Full OAuth JSON credential |
| `accessTokenRef` | `OPENAI_CODEX_ACCESS_TOKEN` | Current access token credential |
| `loginLine` | `/codex-login browser` | Line delegated to the OAuth plugin for sign-in |
| `logoutLine` | `/codex-logout` | Line delegated to the OAuth plugin for sign-out |
| `loginCommand` | `codex-login` | Command name used to detect the OAuth plugin |

The bundle patch sets `openai-codex` `displayName` to `Codex 订阅`. It does not replace `apiKeyEnv`; that stays with the OAuth plugin.

## License

[MIT](LICENSE)
