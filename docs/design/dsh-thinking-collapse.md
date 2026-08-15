# DSH 思考折叠插件设计

## 1. 背景与目标

DeepSeek Harness（DSH）`0.1.0-rc.6` 的聊天视图会把 reasoning 渲染为可展开的 `Think` 行。默认折叠态仍显示思考首行，流式期间显示最新一行；正文开始后不会执行一次明确的自动折叠。

`dsh-thinking-collapse` 将聊天视图调整为 Codex 式交互：

- reasoning 是当前流式尾块时，标题以紧凑时长显示“已处理 <duration>”，完整内容持续可见；
- 后续正文、工具调用或其他 block 出现，或者当前 step 结束时，自动折叠；
- 折叠态只显示本地化的“耗时 <duration>”状态、右侧箭头和底部分隔线，不显示任何思考内容预览；
- 用户可以在结束后点击展开；标题仍保持“耗时 <duration>”，箭头向下，分隔线固定在标题下方，完整 reasoning 以 Markdown 展示并保留原字号和颜色；
- 用户可以再次点击收起，标题文案不随展开状态变化；
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
| 流式尾块 | 强制展开完整 reasoning，标题为“已处理 Ns”/`Worked for Ns` 并持续计时 | 不收起 |
| 后续 block 已出现 | 自动折叠为“耗时 Ns”/`Worked for Ns` | 展开后标题仍为“耗时 Ns”/`Worked for Ns` |
| step 已结束或中断 | 折叠为“耗时 Ns”/`Worked for Ns` | 展开后标题仍为“耗时 Ns”/`Worked for Ns` |
| 历史计时不可用 | 折叠为“思考过程”/`Thoughts` | 可展开 |

思考未结束时统一使用紧凑时长 `8s` 或 `1m 8s`；结束后中文时长格式为 `8秒` 或 `1分钟 8秒`，英文为 `8s` 或 `1m 8s`，负值归零。折叠态不再显示左侧思考图标；使用 DSH 原生向右箭头，展开后由 `DisclosureRow` 切换为向下箭头。状态文案由插件自己的中英 locale namespace 提供，可访问性运行状态文案继续复用 conversation locale。

`DisclosureRow` 只负责标题和箭头，展开状态不参与标题文案计算。分隔线由标题容器持有，保证折叠时位于组件底部、展开时仍位于标题与 reasoning 之间。展开内容使用 `MarkdownText`，从而共享安全 Markdown、行内代码和代码块渲染契约；其基础文字保持 DSH reasoning 原有的 `14px / 24px` 与 `label-tertiary` 颜色，不提升为 assistant 正文层级。

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
- 实时 reasoning 先于计时投影到达的短暂窗口显示“已处理 0s”，不会退回另一套可见状态文案；投影到达后立即切换为事件时间；
- 插件不吞掉 slot 注册冲突。相同 key 和 priority 的第二个插件应在装载阶段明确失败；
- 插件不读写 localStorage，不创建独立业务数据文件，也不改变 Session log。

## 9. 验证策略

### 自动验证

- 计时 fold：正常结束、缺失 block-end、多个 reasoning block、retry、中断和无历史 chunk；
- 展开状态：流式强制展开、后续 block 自动折叠、结束后用户切换；
- 隐私形态：折叠 header 不包含 reasoning 首行或末行，只包含耗时状态与箭头；
- 生命周期文案：流式期间为持续更新的紧凑“已处理 Ns”，结束后折叠与展开均为本地化“耗时 Ns”；
- 展开形态：分隔线保持在标题下方，完整 reasoning 由 `MarkdownText` 渲染，并保留原 reasoning 字号和颜色；
- slot：`priority: -1` 赢过默认 `0`；
- 构建：Host ESM、client loader artifact、类型声明和 npm pack 内容。

### DSH profile 验证

```bash
dsh plugin --profile web add file:<repo>/packages/dsh-thinking-collapse
```

安装后重启 `dsh web`，刷新页面并验证：

1. reasoning 流式期间标题显示持续更新的“已处理 Ns”，完整内容可见；
2. 正文或工具 block 出现后立即折叠；
3. header 只显示“耗时 Ns”和右侧箭头，整行下方有分隔线；
4. 点击后标题仍为“耗时 Ns”，分隔线下显示保留原字号和颜色的 Markdown reasoning；
5. 再次点击后标题不变并隐藏 reasoning；
6. 刷新后最近会话仍能从事件窗口恢复时长；
7. 轨迹视图保持不变。

真实模型调用可能产生用量，执行前单独确认。类型检查、构建、fixture 或组件测试都不能替代这条真实 Web 验证。

### 9.1 已完成的 live E2E

2026-08-14 已在 DSH `0.1.0-rc.6` 上完成一次真实 Web 验证，随后根据用户确认调整生命周期文案和正文层级；调整后的 live E2E 与视觉复核结果以仓库根目录的 [`design-qa.md`](../../design-qa.md) 为准。

## 10. 升级流程

升级 DSH 时必须：

1. 更新精确 peer dependency；
2. 固定新的 upstream commit 和 npm integrity；
3. 对比兼容副本涉及的上游文件与公共类型；
4. 重新核对 slot key、priority 和 Location data 契约；
5. 运行自动验证；
6. 在目标 DSH profile 重做完整流式 Web 验证。

在上述步骤完成前，不扩大 README 的兼容版本声明。
