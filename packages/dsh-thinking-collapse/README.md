# dsh-thinking-collapse

`dsh-thinking-collapse` 为 DeepSeek Harness Web 聊天视图提供 Codex 式思考折叠：思考流式期间完整可见，后续正文或工具 block 出现后自动折叠成本地化的“耗时 2秒”状态行，点击可以重新展开。

> 状态：实验中。已完成 `@deepseek-ai/dsh@0.1.0-rc.6` live Web E2E，尚未发布到 npm。

## 行为

- 只替换聊天视图的 `assistant-step` renderer；
- reasoning 是当前流式尾块时强制展开；
- reasoning 结束后自动折叠，不显示首行或末行预览；
- 折叠行显示基于 Session event 时间戳计算的本地化“耗时”文案；
- 折叠态去掉思考图标，使用右侧箭头和底部分隔线贴近 Codex；
- 历史窗口不含原始 chunk、无法准确恢复时长时只显示“思考过程”/`Thoughts`；
- 保留 Markdown、图片、未知 block、file mention 和 interrupted marker；
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
2. reasoning 流式期间完整内容可见；
3. 正文或工具调用出现后 reasoning 自动折叠；
4. 折叠行只显示“耗时 Ns”以及右侧箭头；
5. 点击折叠行可以展开和再次收起；
6. 刷新页面后最近会话仍能从加载窗口恢复时长；
7. 轨迹视图没有变化。

真实模型调用可能产生费用。自动测试、类型检查和构建不能替代上述 DSH Web 验证。

## Live E2E 记录

2026-08-14 使用默认 `web` profile 的隔离副本 `web-thinking-collapse-e2e`，在 `127.0.0.1:3081` 启动 DSH `0.1.0-rc.6`，并通过 Chrome 使用 `DeepSeek V4 Flash / Max` 完成一次真实 reasoning 请求：

- 服务启动清单包含 `dsh-thinking-collapse` 及全部声明的 client inject；
- reasoning 流式期间思考行保持展开，完整思考内容可见；
- 正文出现后自动折叠为 `耗时 2秒`，header 不包含思考内容预览；
- 点击可以展开完整 reasoning，再次点击可以收起；
- 刷新当前会话后仍恢复 `耗时 2秒`；
- 轨迹视图保持原有 timeline 渲染；
- 页面中只有一个插件 CSS 标签，Chrome 控制台无 warning/error；
- 已按 Codex 参考图完成折叠态视觉对照，隔离 profile 保留用于复查。

API key 由既有 DSH 启动环境提供；验证记录不保存或输出 key 值。

## 冲突与兼容

插件在 `conversation.chat.node` 的 `assistant-step` cell 使用 `priority: -1`。DSH rc.6 默认 renderer 使用 `priority: 0`，因此本插件获胜；另一个插件如果使用相同 key 和 priority，DSH 会在装载时明确报冲突。

DSH 处于 developer preview。升级前必须按 [UPSTREAM.md](UPSTREAM.md) 重新核对兼容副本、slot 契约和事件类型，不能仅放宽 semver 范围。

完整设计见仓库的 [`docs/design/dsh-thinking-collapse.md`](../../docs/design/dsh-thinking-collapse.md)。
本轮视觉对照和交互证据见仓库根目录的 [`design-qa.md`](../../design-qa.md)。

## License

MIT。上游兼容代码的来源与许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
