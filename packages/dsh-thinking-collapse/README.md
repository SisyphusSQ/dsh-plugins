# dsh-thinking-collapse

`dsh-thinking-collapse` 为 DeepSeek Harness Web 聊天视图提供 Codex 式活动折叠：每个模型 step 一条活动行。流式期间或本步普通工具仍在执行、且还没有可见正文时，活动行强制展开，按 block 顺序展示思考 Markdown 和官方工具树；正文出现或本步工具都结束后，自动收成「耗时 Ns」，header 不露出思考或命令预览。点开后标题仍是「耗时 Ns」，下面是思考和工具。

> 状态：实验中。已完成 `@deepseek-ai/dsh@0.1.0-rc.6` 思考折叠与普通工具吸收 live Web E2E，尚未发布到 npm。

## 行为

- 替换聊天视图的 `assistant-step` 与 `tool-call` renderer；
- 每个 step 最多一条活动行；一轮里可以有多条「耗时」（一步一条）；
- 活动时长从思考开始或本步第一个工具开始，到最后一次 tool/result 或正文出现；工具还在跑则继续计时；
- 吸收全部普通工具（bash / read / search / web / todo 等）。流式一开始就把工具画在活动体里，而不是先出现在聊天流再吸进去；
- `ask_user_question` 与审批提问仍留在编辑器或原聊天座位，不折进活动行；
- 没有思考、只有工具时仍出活动行；历史算不出时长时用「工具调用」/`Tool calls`，有思考但无时长时用「思考过程」/`Thoughts`；
- 折叠态去掉思考图标，使用右侧箭头和底部分隔线贴近 Codex；
- 活动未结束时标题显示「已处理 2s」式紧凑时长并持续更新；结束后无论折叠或展开，标题均保持本地化的「耗时」文案；
- 展开内容复用 DSH `MarkdownText` 与官方 `tool.call.toolview` 原子视图；
- 保留 Markdown、图片、未知 block、file mention 和 interrupted marker；
- 正文留在该 step 活动行外面；
- 不修改轨迹视图、模型请求、Session log 或 DSH 核心。

## 本地构建

在 monorepo 根目录执行：

```bash
pnpm install
pnpm --filter dsh-thinking-collapse typecheck
pnpm --filter dsh-thinking-collapse test
pnpm --filter dsh-thinking-collapse build
```

构建输出位于 `packages/dsh-thinking-collapse/lib/`。`lib/client.js` 是 DSH client module loader 可直接 materialize 的 artifact。

## 安装到 DSH profile

先完成构建，再执行：

```bash
dsh plugin --profile web add file:/absolute/path/to/dsh-plugins/packages/dsh-thinking-collapse
```

然后重启 `dsh web` 并刷新页面。客户端插件的普通生产启动不承诺热更新。

卸载：

```bash
dsh plugin --profile web remove dsh-thinking-collapse
```

## 验证清单

1. 发送一条会触发 reasoning 的消息；
2. reasoning 流式期间完整内容可见，标题为持续更新的「已处理 Ns」；
3. 发送一条会打普通工具（例如 bash）的消息；工具一开始就出现在活动体里，而不是先作为独立聊天行再消失；
4. 本步工具仍在跑且还没有正文时，活动行保持展开，耗时包含工具墙钟；
5. 正文出现或本步工具都结束后，自动折叠为「耗时 Ns」，header 不包含思考或命令预览；
6. 点击后标题保持「耗时 Ns」，箭头向下，分隔线下按原顺序显示 Markdown reasoning 和官方工具树；
7. 再次点击可以收起；
8. 没有思考、只有工具时仍出现活动行；刷新后最近会话仍能从加载窗口恢复时长，无法恢复时显示「思考过程」或「工具调用」；
9. 审批 / 提问仍在编辑器，不进活动行；轨迹视图没有变化。

真实模型调用可能产生费用。自动测试、类型检查和构建不能替代上述 DSH Web 验证。

## Live E2E 记录

2026-08-14 使用默认 `web` profile 的隔离副本 `web-thinking-collapse-e2e`，在 `127.0.0.1:3081` 启动 DSH `0.1.0-rc.6`，并通过 Chrome 使用 `DeepSeek V4 Flash / Max` 完成一次真实 reasoning 请求：

- 服务启动清单包含 `dsh-thinking-collapse` 及全部声明的 client inject；
- reasoning 流式期间标题显示 `已处理 2s` 并持续计时，思考行保持展开，完整思考内容可见；
- 正文出现后自动折叠为 `耗时 2秒`，header 不包含思考内容预览；
- 点击后标题保持 `耗时 2秒`，原生箭头向下，标题分隔线保持在 reasoning 上方；
- reasoning 通过 DSH Markdown renderer 展示并保留原字号和颜色；再次点击可以收起；
- 刷新当前会话后仍恢复 `耗时 2秒`；
- 轨迹视图保持原有 timeline 渲染；
- 页面中只有一个插件 CSS 标签，未出现插件运行错误；
- 已分别按 Codex 折叠态和展开态参考图完成视觉对照，隔离 profile 保留用于复查。

2026-08-15 在同一隔离实例上完成工具吸收 live Web 验证（会话 `DSH_TOOL_ABSORB_OK 命令执行目录确认`，工作区 `fixture-repo`）：

- 有思考 + bash：聊天流没有单独工具行；折叠为「耗时 0秒」；展开后是思考 Markdown 和官方 bash 卡片；正文留在活动行外；
- 几乎无思考 + `sleep 3`：DSH 轨迹把该步标成 `(tool call only)`，聊天流仍画出「耗时 3秒」活动行；展开后是官方 `Bash · Sleep 3 seconds then echo marker`，输出 `DSH_TOOL_ABSORB_SLEEP`；正文 `DONE` 在活动行外；
- 再发 `sleep 2`：同样出现「耗时 2秒」，正文 `LIVE` 在活动行外；底栏工具墙钟与活动行一致；
- 轨迹页仍是 USER / ASSISTANT / TOOL / ASSISTANT，没有被聊天折叠 UI 替换。

API key 由既有 DSH 启动环境提供；验证记录不保存或输出 key 值。

## 冲突与兼容

插件在 `conversation.chat.node` 的 `assistant-step` 和 `tool-call` cell 使用 `priority: -1`。DSH rc.6 默认 renderer 使用 `priority: 0`，因此本插件获胜；另一个插件如果使用相同 key 和 priority，DSH 会在装载时明确报冲突。

DSH 处于 developer preview。升级前必须按 [UPSTREAM.md](UPSTREAM.md) 重新核对兼容副本、slot 契约和事件类型，不能仅放宽 semver 范围。

完整设计见仓库的 [`docs/design/dsh-thinking-collapse.md`](../../docs/design/dsh-thinking-collapse.md)。
本轮视觉对照和交互证据见仓库根目录的 [`design-qa.md`](../../design-qa.md)。

## License

MIT。上游兼容代码的来源与许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
