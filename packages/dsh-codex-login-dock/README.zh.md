# dsh-codex-login-dock

[English](README.md) | 中文

DeepSeek Harness 的 Codex 订阅会话登录卡、设置页与 Host 认证状态。本包不注册 LLM adapter，也不实现 PKCE、refresh 或第二套凭据存储。

当原生模型选择器选中 `openai-codex`（展示名「Codex 订阅」）且凭据未就绪时，composer 上方出现登录卡。设置里也有独立的「Codex 订阅」页，登录成功后仍显示已连接。主路径是 `dsh-openai-codex-oauth` 的 silent 浏览器 PKCE。登录成功后会话卡片消失，后续对话仍走原生 DSH。

Host 与 Web client API 对齐 `@deepseek-ai/dsh@0.1.0-rc.6`。fixture 测试覆盖状态、silent 登录、退出登录、取消、端口占用映射、脱敏、dock 显隐、composer block 和设置页。这不是真实 DSH Web / Headless E2E。

## 依赖

同一 profile 需要安装本仓库的 [`dsh-openai-codex-oauth`](../dsh-openai-codex-oauth/README.zh.md)。本包运行时查找 `ctx.openaiCodexOAuth`。该 silent 面不存在时状态为 `missingPlugin`，不会自行启动浏览器登录。退出登录调用同一面上的 `logout()`。

完整 OAuth JSON 使用 `OPENAI_CODEX_OAUTH_CREDENTIAL`，当前 access token 使用 `OPENAI_CODEX_ACCESS_TOKEN`。默认文件是 `$DSH_HOME/.credentials.yaml`。本包不写 `~/.codex`。

## Web

登录卡挂在 `conversation.input.dock`。不占用 `conversation.input.model`，也不自绘模型选择器。

| 状态 | 卡片 | 输入区 |
| --- | --- | --- |
| 未登录 | 标题「Codex 订阅需要登录」；主按钮「打开浏览器登录」；次按钮「稍后」 | 发送被 block；模型座位仍可点 |
| 登录中 | 标题「正在等待浏览器授权」；主按钮「取消」 | 发送保持 block |
| 过期 / 异常 | 标题「登录已过期」或「Codex 订阅登录失败」；主按钮「重新登录」 | 发送保持 block；错误码可见 |
| 缺少 OAuth 插件 | 标题「未安装 OAuth 插件」；没有登录按钮 | 发送保持 block |
| 已连接，或其他 Provider | 不渲染卡片 | 本包不 block 发送 |

「稍后」会收起卡片并保持发送 block。切走 `openai-codex` 后卡片消失，block 解除。

设置页注册独立的 `settings.section`，导航名是「Codex 订阅」，不嵌进原生模型那一行。已连接时页面仍在。

| 状态 | 设置页 |
| --- | --- |
| 未登录 | 标题「Codex 订阅需要登录」；主按钮「打开浏览器登录」；没有「稍后」 |
| 登录中 | 标题「正在等待浏览器授权」；主按钮「取消」 |
| 过期 / 异常 | 标题「登录已过期」或「Codex 订阅登录失败」；主按钮「重新登录」 |
| 缺少 OAuth 插件 | 标题「未安装 OAuth 插件」；没有登录按钮 |
| 已连接 | 标题「Codex 订阅已连接」；主按钮「退出登录」 |

设置页和 dock 的登录留在各自界面里。它们不执行 `/codex-login`，不把输入区换成提问卡，也不依赖 live agent。

## 命令

| 命令 | 行为 |
| --- | --- |
| `/codex-auth-status` | 打印无密钥快照：未登录、登录中、已连接、已过期、缺少插件或异常 |
| `/codex-auth-login` | 通过 `ctx.openaiCodexOAuth` 启动 silent 浏览器 PKCE |
| `/codex-auth-cancel` | 取消进行中的浏览器登录 |
| `/codex-auth-logout` | 通过 `ctx.openaiCodexOAuth` 清除凭据 |

OAuth 插件自己的 `/codex-login`、`/codex-status`、`/codex-logout` 仍然保留。`/codex-login` 仍是交互式斜杠命令，可以继续弹出提问卡。本包不替换这些命令。

Web 卡片和设置页通过 `codexLoginDock/status`、`codexLoginDock/login`、`codexLoginDock/cancel`、`codexLoginDock/logout` 调用同一套 Host 面。命令输出、RPC 载荷和快照不含 access token、refresh token、JWT 和 account id。access 到期时间可以以时间戳出现。

## 配置

以下字段属于 `codex-login-dock` Cordis 行的 `config`：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `oauthCredentialRef` | `OPENAI_CODEX_OAUTH_CREDENTIAL` | 完整 OAuth JSON 凭据 |
| `accessTokenRef` | `OPENAI_CODEX_ACCESS_TOKEN` | 当前 access token 凭据 |

`displayName: Codex 订阅` 和 `apiKeyEnv: OPENAI_CODEX_ACCESS_TOKEN` 由 OAuth 插件的 patch 提供，避免本包覆盖时丢掉 token env。

## 许可证

[MIT](LICENSE)
