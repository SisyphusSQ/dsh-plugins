# dsh-thinking-collapse

[English](README.md) | 中文

为 DeepSeek Harness Web 聊天视图提供 Codex 式活动折叠。

已按 `@deepseek-ai/dsh@0.1.0-rc.6` 验证。

## 做什么

插件替换聊天视图的 `assistant-step` 与 `tool-call` 渲染器，让每一轮只有一条外层活动行。

本轮仍在进行时——思考正在流式输出，或本轮普通工具仍在执行，且还没有可见正文——外层保持展开。内层思考保持 DSH 默认的 Think 行：Think 图标、标题 `Think`、折叠时显示首行、流式时显示最新一行。官方工具树按时间顺序出现在外层里。标题以紧凑时长持续更新，例如「已处理 2s」。

本轮结束后——正文出现，或本轮工具都已结束——外层自动收成「耗时 2秒」这类标题。折叠态 header 不预览思考或命令。点开外层后，每一段 Think 仍然默认折叠，需要再点一次才看到该段内容。

![折叠后的活动行](screenshots/collapsed.png)

![展开后的活动行](screenshots/expanded.png)

## 行为

- 每一轮一条外层活动行。该轮所有思考和普通工具都进这一条。
- 内层思考保持 DSH 默认 Think 行，默认收起，流式期间也不强制展开，也不再显示内层「耗时 Ns」。
- 活动时长从本轮思考开始或第一个工具开始，到最后一次 tool/result 或正文出现。工具还在跑则继续计时。
- 吸收全部普通工具（bash / read / search / web / todo 等）。流式一开始就把工具画在外层活动体里，而不是先出现在聊天流再吸进去。
- `ask_user_question` 与审批提问仍留在编辑器或原聊天座位，不折进活动行。
- 没有思考、只有工具时仍出活动行。历史算不出时长时用「工具调用」/`Tool calls`，有思考但无时长时用「思考过程」/`Thoughts`。
- 外层折叠态去掉思考图标，使用右侧箭头和底部分隔线。内层思考保留 DSH 的 Think 图标。
- 内层 Think 正文与上游一致，使用纯文本。正文继续用 DSH `MarkdownText`。工具复用官方 `tool.call.toolview` 原子视图，并保留 Markdown、图片、未知 block、file mention 和 interrupted marker。
- 正文留在外层活动行外面。
- 不修改轨迹视图、模型请求或 Session log。

## 验证

兼容边界与验证证据记录在[设计文档](https://github.com/SisyphusSQ/dsh-plugins/blob/main/docs/design/dsh-thinking-collapse.md)中。当前兼容基线为 `@deepseek-ai/dsh@0.1.0-rc.6`。

## License

MIT。上游说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
