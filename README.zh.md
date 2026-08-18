# dsh-plugins

[English](README.md) | 中文

[DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 的第三方插件仓库。`packages/` 下每个目录都是一个可独立安装的插件。

已按 `@deepseek-ai/dsh@0.1.0-rc.6` 验证。

## 安装

需要 Node.js 22 或更高版本，并确保 `pnpm` 在 `PATH` 中。按需将插件安装到 DSH Web profile：

```bash
dsh plugin --profile web add @suqingsq/dsh-openai-codex-oauth@0.2.0
dsh plugin --profile web add @suqingsq/dsh-codex-login-dock@0.2.0
dsh plugin --profile web add @suqingsq/dsh-composer-skill-mention@0.2.0
dsh plugin --profile web add @suqingsq/dsh-session-tools@0.2.0
dsh plugin --profile web add @suqingsq/dsh-agent-plugins@0.2.0
dsh plugin --profile web add @suqingsq/dsh-thinking-collapse@0.2.0
dsh plugin --profile web add @suqingsq/dsh-worktree-workspaces@0.2.0
```

除 Codex 登录卡需要同一 profile 中的 OAuth 包外，每个包都可以独立安装。以上命令固定到已按 DSH `0.1.0-rc.6` 验证的插件版本；完整 scoped 包集合也已在日常 DSH `0.1.0-rc.7` Web profile 中完成安装与加载回读。

旧 unscoped 包名已经弃用，请迁移到对应的 `@suqingsq/*@0.2.0` 包。

## 插件

### [@suqingsq/dsh-openai-codex-oauth](packages/dsh-openai-codex-oauth/README.zh.md)

为原生 `openai-codex` 路由提供 ChatGPT 订阅 OAuth：凭据、refresh、斜杠命令与 silent 浏览器登录。

### [@suqingsq/dsh-codex-login-dock](packages/dsh-codex-login-dock/README.zh.md)

composer 上方的 Codex 订阅登录卡、持续可见的设置页，以及无密钥 Host 认证状态。

### [@suqingsq/dsh-thinking-collapse](packages/dsh-thinking-collapse/README.zh.md)

为 Web 聊天视图提供 Codex 式活动行：每一轮把思考和普通工具调用收成一条带耗时的行，内层思考保持 DSH 默认 Think 行，正文留在行外。

![折叠后的思考与工具活动行](packages/dsh-thinking-collapse/screenshots/collapsed.png)

### [@suqingsq/dsh-composer-skill-mention](packages/dsh-composer-skill-mention/README.zh.md)

为 Web 输入框提供 Codex 风格的 Skill 提及。输入 `$` 或全角 `￥` 选择 Skill，宿主会在进入 Agent step 前加载该 Skill。

![Skill 提及候选](packages/dsh-composer-skill-mention/screenshots/mention.png)

### [@suqingsq/dsh-session-tools](packages/dsh-session-tools/README.zh.md)

六个模型侧会话工具，以及 Web `@` 会话候选：选中后把另一会话作为带出处的上下文注入本轮。

![会话提及候选](packages/dsh-session-tools/screenshots/mention.png)

### [@suqingsq/dsh-agent-plugins](packages/dsh-agent-plugins/README.zh.md)

[Agent Plugins](https://github.com/agentplugins/agent-plugins-spec) 标准包适配：CLI、Skill/MCP 注册，以及带插件级和组件级开关的 Web 侧栏面板。

![Agent Plugins 面板](packages/dsh-agent-plugins/screenshots/panel.png)

### [@suqingsq/dsh-worktree-workspaces](packages/dsh-worktree-workspaces/README.zh.md)

创建和归档 Git linked worktree。同一包提供 `/worktree`、模型工具、CLI，以及用于切换 DSH Workspace 的 Web 弹层。

![Git 工作树选择器](packages/dsh-worktree-workspaces/screenshots/picker.png)

## 仓库

本仓库是 pnpm workspace。包约定见 [AGENTS.md](AGENTS.md)。插件索引见 [`packages/README.md`](packages/README.md)，版本历史见 [CHANGELOG.md](CHANGELOG.md)。

## License

[MIT](LICENSE)
