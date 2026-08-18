# ChangeLog

本文件记录 dsh-plugins 的用户可感知变更与正式发布历史。尚未发布的内容保留在 `Unreleased`，正式版本以对应 Git tag、GitHub Release 或 npm registry 状态为准。

## Unreleased

- feature
  - 新增 `dsh-codex-login-dock`，在 DSH Web 会话输入区和设置页提供 Codex 订阅登录状态、silent 浏览器登录、取消与退出入口。
  - 新增 `dsh-openai-codex-oauth`，维护 `openai-codex` 的 OAuth 凭据、PKCE 登录、请求前 refresh、斜杠命令和供 Web 登录界面使用的 Host silent 服务。
- optimization
  - `dsh-codex-login-dock` 改为直接使用 OAuth Host 服务，不再依赖 live agent 或通过会话命令触发登录。
- script
  - 新增 monorepo npm 包发版 Skill，统一包检查、发布和 registry 回读流程。

## History

### dsh-thinking-collapse v0.2.0(20260817)

- optimization
  - 将同一轮的思考与普通工具调用收进一条外层活动行，并保留内层 Think 行与正文边界。
- note
  - `dsh-thinking-collapse@0.2.0` 已发布到 npm registry，`latest` 已指向该版本。

### v0.1.0(20260815)

- feature
  - 发布 `dsh-agent-plugins@0.1.0`，提供 Agent Plugins 适配、CLI、Skill/MCP 注册和 Web 管理面板。
  - 发布 `dsh-composer-skill-mention@0.1.0`，支持在 Web composer 中用 `$` / `￥` 选择并注入 Skill。
  - 发布 `dsh-session-tools@0.1.0`，提供六个会话工具和 Web `@` 会话上下文注入。
  - 发布 `dsh-thinking-collapse@0.1.0`，提供 Codex 风格的思考与普通工具活动折叠行。
  - 发布 `dsh-worktree-workspaces@0.1.0`，提供 Git linked worktree 创建、归档、CLI、模型工具和 Workspace 选择器。
- note
  - 首发版本要求 Node.js 22 或更高版本，兼容基线为 `@deepseek-ai/dsh@0.1.0-rc.6`。
  - 五个 npm 包均完成 registry 版本、integrity、`latest` 与 DSH Web profile 安装结果回读。
