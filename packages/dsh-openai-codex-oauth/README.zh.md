# dsh-openai-codex-oauth

[English](README.md) | 中文

为 DeepSeek Harness 的 `openai-codex` 提供 ChatGPT 订阅 OAuth。从 [`dyuan311/dsh-openai-codex-oauth@0.1.1`](https://github.com/dyuan311/dsh-openai-codex-oauth) fork，在本仓库维护。

本包负责写入 OAuth 凭据、在 Codex 请求前 refresh，并提供 `/codex-login`、`/codex-status`、`/codex-logout`。另外提供 Host **silent browser login**，给 `dsh-codex-login-dock` 的设置页和会话 dock 使用：完成 PKCE 时不弹 composer 提问卡，也不往会话日志写 `/codex-login`。

不注册 LLM adapter。`openai-codex` 路由仍是 `@deepseek-ai/dsh-llm-pi-ai`。PKCE、回调服务和 refresh 仍在 `@earendil-works/pi-ai`。

Host API 对齐 `@deepseek-ai/dsh@0.1.0-rc.6`。fixture 测试覆盖 silent 登录、取消、进行中互斥、端口占用和命令注册。这不是真实 DSH Web / Headless E2E。

## 行为

- 完整 OAuth JSON：`OPENAI_CODEX_OAUTH_CREDENTIAL`
- 当前 access token：`OPENAI_CODEX_ACCESS_TOKEN`
- 默认文件：`$DSH_HOME/.credentials.yaml`
- 浏览器 PKCE 回调：`http://localhost:1455/auth/callback`
- 不读写 `~/.codex`

bundle patch 会把 `openai-codex` 的 `apiKeyEnv` 设为 `OPENAI_CODEX_ACCESS_TOKEN`，`displayName` 设为 `Codex 订阅`。

silent 的 `loginBrowser` 在 `auth_url` 时用系统 opener 打开浏览器，等待本机回调，不调用 `userQuestions`。`/codex-login` 和 `/codex-login device` 仍走提问卡。

## 命令

| 命令 | 行为 |
| --- | --- |
| `/codex-login [browser\|device]` | 交互式 OAuth。浏览器登录在 composer 提问卡里等待。设备码仍走这条命令。 |
| `/codex-status` | 显示无密钥的凭据状态、来源和 access 到期时间 |
| `/codex-logout` | 清除存储的 OAuth 凭据和 access token |

## Host 服务

`ctx.openaiCodexOAuth`：

| 方法 | 行为 |
| --- | --- |
| `loginBrowser(signal?)` | silent 浏览器 PKCE。打开系统浏览器。不写会话命令日志。 |
| `logout()` | 清除两个凭据引用 |

Web dock 和设置页必须调这个面，而不是 `/codex-login`。

## 配置

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `oauthCredentialRef` | `OPENAI_CODEX_OAUTH_CREDENTIAL` | 完整 OAuth JSON 凭据 |
| `refreshBeforeMs` | `300000` | 在 access 到期前这么多毫秒 refresh |

## 致谢

Fork 基线：[`dyuan311/dsh-openai-codex-oauth@0.1.1`](https://github.com/dyuan311/dsh-openai-codex-oauth)（MIT）。

本包使用 DeepSeek Harness 的 [`@deepseek-ai/dsh-llm-pi-ai`](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/llm/llm-pi-ai) 和 [`@earendil-works/pi-ai`](https://github.com/earendil-works/pi/tree/main/packages/ai)。声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 许可证

[MIT](LICENSE)
