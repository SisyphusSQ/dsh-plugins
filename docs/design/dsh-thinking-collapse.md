# DSH 思考折叠插件设计

## 1. 背景与目标

DeepSeek Harness（DSH）`0.1.0-rc.6` 的聊天视图会把 reasoning 渲染为可展开的 `Think` 行。默认折叠态仍显示思考首行，流式期间显示最新一行；正文开始后不会执行一次明确的自动折叠。

`dsh-thinking-collapse` 将聊天视图调整为 Codex 式交互：

- reasoning 是当前流式尾块时，完整内容持续可见；
- 后续正文、工具调用或其他 block 出现，或者当前 step 结束时，自动折叠；
- 折叠态只显示本地化的“耗时 <duration>”状态、右侧箭头和底部分隔线，不显示任何思考内容预览；
- 用户可以在结束后点击展开或再次收起；
- 只影响聊天视图，不修改轨迹视图、DSH Host 行为或模型请求。

本插件的目标是一个可独立安装、可卸载、可验证的正式 DSH client 插件，不通过 DOM 查询、CSS 覆盖或修改 DSH 安装目录实现。

## 2. 兼容边界

- 已验证目标：`@deepseek-ai/dsh@0.1.0-rc.6`。
- DSH 仍处于 developer preview；所有 DSH peer dependency 精确锁定到 `0.1.0-rc.6`。
- 插件依赖 `conversation.chat.node` keyed slot、`assistant-step` key、Conversation Definition 和 Step Location data 契约。
- 同一 slot cell 的同优先级注册会失败。插件使用 `priority: -1` shadow 默认 `priority: 0` renderer，并把其他 `assistant-step` shadow 插件视为显式冲突。
- 历史窗口不包含原始 `assistant/chunk` 时无法恢复 reasoning 的准确起止时间。此时折叠行显示“思考过程”/`Thoughts`，不会用整段回答时长伪装成思考时长。

## 3. 总体架构

```text
assistant/chunk / step/end / assistant/message / llm/retry
                         │
                         ▼
            ThinkingTimingDefinition
                         │
            ConversationStepDataMap
                         │
                         ▼
              AssistantNodeView shadow
                         │
              AssistantMarkdown blocks
                         │
                         ▼
                 ReasoningRow
```

插件包含两个相互独立的 client contribution：

1. `ThinkingTimingDefinition` 从持久 Session 事件构建每个 reasoning block 的计时数据；
2. shadow renderer 读取计时数据并实现展开状态机。

## 4. 插件装载

包提供一个无业务行为的 Host 入口，使 Cordis Loader 能通过 `cordis.patch.yml` 把包加入 profile layer：

```yaml
- insert:
    - id: dsh-thinking-collapse
      name: 'dsh-thinking-collapse'
```

`package.json` 同时声明：

- `dsh.bundle.patch` 指向 `cordis.patch.yml`；
- `exports["./client"]` 指向 loader-compatible client artifact；
- `dsh.client.platform` 为 `web`；
- `dsh.client.inject` 列出 locale、runtime、conversation、slots、primitives 和 attachment client 模块。

因此“纯 client”表示业务行为只发生在浏览器，不表示 npm 包可以缺少 Loader 可挂载的根入口。

构建阶段会把 CSS module 汇总内容内联到 `lib/client.js`。artifact materialize 时按照 DSH rc.6 的约定创建带 `data-plugin` 和 `data-plugin-css` 的 `<style>` 标签；同一插件样式已经存在时不会重复插入。

## 5. 计时投影

### 5.1 数据结构

Definition 以 `turn:step` 为稳定 id，在 Step Location 发布：

```ts
interface ThinkingTimingData {
  blocks: Readonly<Record<number, {
    startedAt: number
    endedAt: number | null
  }>>
}
```

key 使用 `thinking-collapse-timing`，通过 TypeScript declaration merge 扩展 `ConversationStepDataMap`。

### 5.2 事件规则

- `step/start`：创建空状态；
- reasoning `block-start` 或第一个 `reasoning-delta`：记录该 index 的 `startedAt`；
- reasoning `block-end`：记录 `endedAt`；
- 后续非 reasoning block 开始、正文 delta 或工具调用 delta：在 provider 缺失 `block-end` 时关闭当前 reasoning；
- `assistant/message` / `step/end`：关闭仍未结束的 reasoning；
- `llm/retry`：清空失败尝试的计时，避免把被隐藏的 partial 计入最终结果。

所有时间使用 Session event 的 Unix epoch milliseconds，而不是组件挂载时间或定时器 tick 时间。浏览器定时器只负责流式期间刷新整秒展示。

## 6. 渲染与交互状态机

每个 reasoning block 根据其是否为当前流式尾块决定展开状态：

| 状态 | 展示 | 用户点击 |
| --- | --- | --- |
| 流式尾块 | 强制展开完整 reasoning，标题为“思考中”/`Thinking` | 不收起 |
| 后续 block 已出现 | 自动折叠为“耗时 Ns”/`Worked for Ns` | 可展开 |
| step 已结束或中断 | 折叠为“耗时 Ns”/`Worked for Ns` | 可展开 |
| 历史计时不可用 | 折叠为“思考过程”/`Thoughts` | 可展开 |

中文时长格式为 `8秒` 或 `1分钟 8秒`，英文为 `8s` 或 `1m 8s`，负值归零。折叠态不再显示左侧思考图标；使用 DSH 原生向右箭头，展开后由 `DisclosureRow` 切换为向下箭头。状态文案由插件自己的中英 locale namespace 提供，可访问性运行状态文案继续复用 conversation locale。

## 7. Renderer 兼容副本

rc.6 没有独立的 reasoning slot，也没有从 `/client` 公共入口导出 `AssistantNodeView`、`AssistantMarkdown` 或 `ReasoningRow`。为了只替换 reasoning 行而不丢失现有聊天能力，插件维护以下兼容副本：

- `AssistantNodeView`；
- `AssistantMarkdown`；
- `ReasoningRow`；
- message image labels 的必要桥接；
- 对应 CSS module。

兼容副本必须保留 Markdown、图片、未知 block、file mention、interrupted marker 和 tool-call 跳过语义。来源锁定在：

- 仓库：`deepseek-ai/deepseek-harness`；
- commit：`47f943859bef60e4160492346772ded9b24f765a`；
- 源码许可证：MIT；
- rc.6 conversation npm tarball integrity：`sha512-pKDKZYTRvO9pBTyHvVOtPDuTzNfCHwy7GmeIaRLjyCORLPM3uv0BuMc1qIHVI6LcK54l+cRGIuSSGah3bO/0vw==`。

具体文件与改动记录见包内 `UPSTREAM.md` 和 `THIRD_PARTY_NOTICES.md`。

## 8. 失败与降级

- shadow renderer 抛出运行时错误时，DSH slot renderer 会 abdicate 当前 entry，默认 `priority: 0` renderer 成为下一位候选；
- 计时 Definition 缺少历史 chunk 时只降级时长，不影响 reasoning 内容本身；
- 插件不吞掉 slot 注册冲突。相同 key 和 priority 的第二个插件应在装载阶段明确失败；
- 插件不读写 localStorage，不创建独立业务数据文件，也不改变 Session log。

## 9. 验证策略

### 自动验证

- 计时 fold：正常结束、缺失 block-end、多个 reasoning block、retry、中断和无历史 chunk；
- 展开状态：流式强制展开、后续 block 自动折叠、结束后用户切换；
- 隐私形态：折叠 header 不包含 reasoning 首行或末行，只包含耗时状态与箭头；
- slot：`priority: -1` 赢过默认 `0`；
- 构建：Host ESM、client loader artifact、类型声明和 npm pack 内容。

### DSH profile 验证

```bash
dsh plugin --profile web add file:<repo>/packages/dsh-thinking-collapse
```

安装后重启 `dsh web`，刷新页面并验证：

1. reasoning 流式期间完整可见；
2. 正文或工具 block 出现后立即折叠；
3. header 只显示“耗时 Ns”和右侧箭头，整行下方有分隔线；
4. 点击可以展开与收起；
5. 刷新后最近会话仍能从事件窗口恢复时长；
6. 轨迹视图保持不变。

真实模型调用可能产生用量，执行前单独确认。类型检查、构建、fixture 或组件测试都不能替代这条真实 Web 验证。

### 9.1 已完成的 live E2E

2026-08-14 已在 DSH `0.1.0-rc.6` 上完成上述真实 Web 验证。使用隔离 profile `web-thinking-collapse-e2e`、独立端口 `127.0.0.1:3081` 和 Chrome，实际发送一次 `DeepSeek V4 Flash / Max` reasoning 请求。观测结果包括流式强制展开、正文出现后自动折叠为 `耗时 2秒`、无内容预览、手动展开/收起、刷新后时长恢复，以及轨迹视图不受影响。浏览器控制台无 warning/error；折叠态已和 Codex 参考图并排复核，完整记录见仓库根目录的 [`design-qa.md`](../../design-qa.md)。

## 10. 升级流程

升级 DSH 时必须：

1. 更新精确 peer dependency；
2. 固定新的 upstream commit 和 npm integrity；
3. 对比兼容副本涉及的上游文件与公共类型；
4. 重新核对 slot key、priority 和 Location data 契约；
5. 运行自动验证；
6. 在目标 DSH profile 重做完整流式 Web 验证。

在上述步骤完成前，不扩大 README 的兼容版本声明。
