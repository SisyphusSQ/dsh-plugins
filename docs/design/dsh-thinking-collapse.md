# DSH 思考折叠插件设计

- 状态：已完成 rc.6 实现与隔离 Web profile 验证；`dsh-thinking-collapse@0.1.0` 于 2026-08-15 首发，unscoped `0.2.0` 于 2026-08-17 发布，当前 `@suqingsq/dsh-thinking-collapse@0.2.0` 已发布并在日常 rc.7 Web profile 中激活。2026-08-16 将聊天契约改为整轮一条外层耗时；同日先做成内层嵌套耗时行，随后改为内层恢复 DSH 默认 Think 行

## 1. 背景与目标

DeepSeek Harness（DSH）`0.1.0-rc.6` 的聊天视图会把 reasoning 渲染为可展开的 `Think` 行。默认折叠态仍显示思考首行，流式期间显示最新一行；正文开始后不会执行一次明确的自动折叠。工具调用不是 `assistant-step` 里的一块 Markdown，而是独立的 `tool-call` Chat Node，由 `@deepseek-ai/dsh-client-ui-tool` 画在思考行旁边。

`dsh-thinking-collapse` 将聊天视图调整为 Codex 式、按 **整轮** 吸收的活动行：

- 每一轮只有一条外层活动行；标题是这一轮的总耗时；
- 该轮所有思考和普通工具都进这条外层；展开后按时间顺序排列；
- 每一段思考恢复为 DSH 默认 Think 行：Think 图标、标题 `Think`、折叠时显示首行、流式时显示最新一行，可独立展开；不显示内层「耗时 Ns」；
- 流式期间或本轮普通工具仍在执行、且还没有可见正文时，外层强制展开；内层 Think 即使正在流式也不强制展开；
- 正文出现，或本轮已结算且工具都结束时，外层自动收成「耗时 Ns」；header 不露出思考或命令预览；
- 活动时长从本轮第一次思考或第一个工具开始，到最后一次 `tool/result` 或正文出现；工具还在跑则继续计时；
- 吸收全部普通工具（bash / read / search / web / todo 等）。流式一开始就把工具画在外层活动体里；
- `ask_user_question` 与审批提问已经离开消息流、进了编辑器，不折进活动行；
- 没有思考、只有工具时仍出活动行；历史算不出时长时，有思考显示「思考过程」/`Thoughts`，纯工具显示「工具调用」/`Tool calls`；
- 正文留在外层活动行外面；
- 只影响聊天视图，不修改轨迹视图、DSH Host 行为或模型请求。

本插件的目标是一个可独立安装、可卸载、可验证的正式 DSH client 插件，不通过 DOM 查询、CSS 覆盖或修改 DSH 安装目录实现。

## 2. 兼容边界

- 已验证目标：`@deepseek-ai/dsh@0.1.0-rc.6`。思考折叠与普通工具吸收均已完成隔离 profile live Web E2E。
- DSH 仍处于 developer preview；所有 DSH peer dependency 精确锁定到 `0.1.0-rc.6`。
- 插件依赖 `conversation.chat.node` keyed slot、`assistant-step` 与 `tool-call` key、`tool.call.toolview` 子 slot、Conversation Definition 和 Step Location data 契约。
- 同一 slot cell 的同优先级注册会失败。插件使用 `priority: -1` shadow 默认 `priority: 0` renderer，并把其他相同 key 的 shadow 插件视为显式冲突。
- 历史窗口不包含原始 chunk 或 tool 事件时无法恢复准确起止时间。此时折叠行显示「思考过程」或「工具调用」，不会用整段回答时长伪装成活动时长。

## 3. 总体架构

```text
assistant/chunk / tool/call / tool/result / step/end / assistant/message / llm/retry
                         │
                         ▼
            ThinkingTimingDefinition
                         │
            ConversationStepDataMap
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
 AssistantNodeView shadow        ToolCallNodeView shadow
          │                             │
 visible reasoning/text          tools-only hidden turn
 → first visible assistant hosts → first absorbed root hosts
          │                      absorbed (visible turn) → null
          ▼                      unmatched → ToolCallTree
     ReasoningRow (turn outer)
      ThinkRow per thought (DSH native Think)
      official tool.call.toolview tree
```

插件包含两组相互配合的 client contribution：

1. `ThinkingTimingDefinition` 从持久 Session 事件构建每个 reasoning block 以及整步活动的计时数据，并记录本步 `callIds`；
2. shadow renderer 读取计时数据：第一个有可见内容的 `assistant-step` 把 **整轮** 的 reasoning / 可吸收 tool-call 收成一条外层活动行，每段思考用 DSH 默认 Think 行；`tool-call` 在本轮已有可见 assistant-step 时对已吸收的 call 返回 `null`。若整轮 assistant-step 都因只有 tool-call 被 DSH 标成 hidden，则由该轮第一个被吸收的工具根节点托管外层活动行，避免纯工具轮从聊天流消失。后续 step 若只有已被吸收的思考/工具，渲染器返回 `null`，交给 DSH 的 `flowItem:empty { display: none }` 去掉空行；正文仍留在各自 step 节点上、画在外层行外面。

官方 `ToolCallTree` 不从 `@deepseek-ai/dsh-client-ui-tool/client` 导出。`SlotCore` 规定 child slot 全局只能声明一次，官方 `tool-call` 条目已经声明了 `tool.call.toolview`。本插件的两个 shadow **不得**再声明该 children，否则装载失败。运行时通过 `ctx.slots.entriesOfSlot('tool.call.toolview')` 按 `key === toolName` 查找官方原子视图；无匹配 key 时用 `JsonBlock` fallback。

## 4. 插件装载

包提供一个无业务行为的 Host 入口，使 Cordis Loader 能通过 `cordis.patch.yml` 把包加入 profile layer：

```yaml
- insert:
    - id: dsh-thinking-collapse
      name: '@suqingsq/dsh-thinking-collapse'
```

`package.json` 同时声明：

- `dsh.bundle.patch` 指向 `cordis.patch.yml`；
- `exports["./client"]` 指向 loader-compatible client artifact；
- `dsh.client.platform` 为 `web`；
- `dsh.client.inject` 列出 locale、runtime、conversation、ui-tool、slots、primitives 和 attachment client 模块。

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
  activity: { startedAt: number; endedAt: number | null } | undefined
  callIds: readonly string[]
  pendingCallIds: readonly string[]
}
```

key 使用 `thinking-collapse-timing`，通过 TypeScript declaration merge 扩展 `ConversationStepDataMap`。

### 5.2 事件规则

- `step/start`：创建空状态；
- reasoning `block-start` 或第一个 `reasoning-delta`：记录该 index 的 `startedAt`，并打开活动墙钟；
- reasoning `block-end`：记录该 block 的 `endedAt`，活动继续；
- `tool-call-delta` / `block-start` 且 `blockType === 'tool-call'` / `tool/call`：关闭当前 reasoning block（若 provider 缺失 `block-end`），记录 `callId`，活动继续；
- `text-delta` / 正文或图片 block 开始：关闭当前 reasoning；若没有未完成工具则结束活动；若仍有 pending 工具则活动墙钟继续；
- `tool/result`：从 pending 集合移除该 `callId`；若 step 已关闭或正文已出现且没有未完成工具，则结束活动；
- `assistant/message`：补录 finalized message 里的 tool-call `callIds`，不把它们标成 pending；
- `assistant/message` / `step/end`：关闭仍未结束的 reasoning；若没有 pending 工具则结束活动；
- `llm/retry`：清空失败尝试的计时和 call 集合，避免把被隐藏的 partial 计入最终结果。

`tool/call` 与 `tool/result` 使用 `immediate` 发布，避免工具节点先出现在聊天流、再被吸收。chunk 仍使用 `animation-frame`。

所有时间使用 Session event 的 Unix epoch milliseconds，而不是组件挂载时间或定时器 tick 时间。浏览器定时器只负责活动仍在进行时刷新整秒展示。

## 6. 渲染与交互状态机

每一轮把全部 reasoning 与可吸收 tool-call 收成 **一条** 外层活动行。外层时长合并各 step 的 `activity` 墙钟。`ask_user_question` 不是可吸收工具。外层 live 条件是：本轮没有可见正文，并且（任一 step 仍在流式，或仍有 running 工具）。

内层每一段思考使用上游 `ReasoningRow` 的 Think 形态，而不是再套一条耗时行。内层 running 条件是：该思考所属 step 仍在流式，且它是该 step 里最后一段尚未 `endedAt` 的 reasoning；running 只驱动扫光和最新一行预览，不强制展开。工具卡片是外层活动体里的兄弟节点，不塞进某一段思考里。

| 状态 | 展示 | 用户点击 |
| --- | --- | --- |
| 流式 / 本轮工具仍在跑、且本轮还没有可见正文 | 外层强制展开，标题为“已处理 Ns”/`Worked for Ns`；内层 Think 默认折叠，当前思考在折叠态显示最新一行，更早的思考显示首行；官方工具树按时间顺序可见 | 外层不能收起；内层 Think 可独立展开 |
| 正文出现，或本轮已结算且工具都结束 | 外层自动折叠为“耗时 Ns”/`Worked for Ns` | 展开外层后标题仍为“耗时 Ns”；内层 Think 默认仍折叠，需再点开 |
| 历史计时不可用，且含思考 | 外层折叠为“思考过程”/`Thoughts` | 可展开外层；内层仍为 `Think` |
| 历史计时不可用，且只有工具 | 外层折叠为“工具调用”/`Tool calls` | 可展开 |

活动未结束时统一使用紧凑时长 `8s` 或 `1m 8s`；结束后中文时长格式为 `8秒` 或 `1分钟 8秒`，英文为 `8s` 或 `1m 8s`，负值归零。外层折叠态不再显示左侧思考图标；使用 DSH 原生向右箭头，展开后由 `DisclosureRow` 切换为向下箭头。内层 Think 保留上游 Think 图标与标题 `Think`。状态文案由插件自己的中英 locale namespace 提供，可访问性运行状态文案继续复用 conversation locale。

`DisclosureRow` 只负责标题和箭头，展开状态不参与标题文案计算。外层分隔线由标题容器持有，保证折叠时位于组件底部、展开时仍位于标题与活动体之间。内层 Think 正文与上游一致，使用 `pre-wrap` 纯文本；正文回答使用 `MarkdownText`；工具使用官方 `tool.call.toolview`。思考基础文字保持 DSH reasoning 原有的 `14px / 24px` 与 `label-tertiary` 颜色，不提升为 assistant 正文层级，也不把工具卡片染成思考色。

吸收判断：tool-call 节点 `location.kind` 为 `turn` 或 `step` 时，扫描对应 **整轮** step 的 `thinking-collapse-timing.callIds` 或 `assistant-step` blocks。对不上就不要吸收，流里照常画工具。

DSH 的 `hasVisibleContent` 把纯 `tool-call` 的 `assistant-step` 标成 `visibility: hidden`。插件与这条规则对齐：本轮没有任何 reasoning / 正文的 assistant 节点时，不画外层活动行，改由该轮第一个被吸收的工具根节点托管，避免 hidden 节点占位、聊天流又没有活动行。后续可见 assistant-step 出现后，工具托管立即让出，改由第一个可见 assistant-step 托管整轮活动。

## 7. Renderer 兼容副本

rc.6 没有独立的 reasoning slot，也没有从 `/client` 公共入口导出 `AssistantNodeView`、`AssistantMarkdown`、`ReasoningRow` 或 `ToolCallTree`。为了替换活动行并吸收工具，插件维护以下兼容副本：

- `AssistantNodeView`；
- `AssistantMarkdown`；
- `ReasoningRow`（外层耗时行）；
- `ThinkRow`（内层，贴近上游 Think）；
- `ToolCallTree` / `ToolCallNodeView`；
- message image labels 的必要桥接；
- 对应 CSS module。

兼容副本必须保留 Markdown、图片、未知 block、file mention、interrupted marker。可吸收 tool-call 不再跳过，而是画进活动体；`ask_user_question` 仍跳过 assistant 渲染，由 tool-call 座位自己画。来源锁定在：

- 仓库：`deepseek-ai/deepseek-harness`；
- commit：`47f943859bef60e4160492346772ded9b24f765a`；
- 源码许可证：MIT；
- rc.6 conversation npm tarball integrity：`sha512-pKDKZYTRvO9pBTyHvVOtPDuTzNfCHwy7GmeIaRLjyCORLPM3uv0BuMc1qIHVI6LcK54l+cRGIuSSGah3bO/0vw==`。

具体文件与改动记录见包内 `UPSTREAM.md` 和 `THIRD_PARTY_NOTICES.md`。

## 8. 失败与降级

- shadow renderer 抛出运行时错误时，DSH slot renderer 会 abdicate 当前 entry，默认 `priority: 0` renderer 成为下一位候选；
- 计时 Definition 缺少历史 chunk 时只降级时长，不影响 reasoning 或工具内容本身；
- 实时活动先于计时投影到达的短暂窗口显示“已处理 0s”，不会退回另一套可见状态文案；投影到达后立即切换为事件时间；
- 工具节点尚未写入 Chat snapshot 时，活动体暂时跳过该树，投影或 snapshot 到达后补上；
- 插件不吞掉 slot 注册冲突。相同 key 和 priority 的第二个插件应在装载阶段明确失败；
- 插件不读写 localStorage，不创建独立业务数据文件，也不改变 Session log。

## 9. 验证策略

### 自动验证

- 计时 fold：正常结束、缺失 block-end、工具不关活动、tool/result 延长墙钟、正文出现但工具未完成、多个 reasoning block、retry、中断和无历史 chunk；
- 吸收：普通工具按 step 吸收，`ask_user_question` 不吸收；
- 展开状态：流式强制展开外层、内层 Think 默认折叠、流式段显示最新一行预览、工具一开始就在活动体、正文出现后外层自动折叠；
- 隐私形态：外层折叠 header 不包含 reasoning 或命令预览，只包含耗时状态与箭头；内层 Think 折叠态显示首行或最新一行；
- 生命周期文案：流式期间为持续更新的紧凑“已处理 Ns”，结束后折叠与展开均为本地化“耗时 Ns”；无时长纯工具为“工具调用”；内层标题固定为上游 `Think`；
- 展开形态：外层分隔线保持在标题下方；内层 Think 正文为上游纯文本；工具走官方 `tool.call.toolview`；
- slot：`assistant-step` 与 `tool-call` 的 `priority: -1` 赢过默认 `0`，且不声明 `tool.call.toolview` children；原子视图通过已声明 keyed slot 运行时分发；
- 构建：Host ESM、client loader artifact、类型声明和 npm pack 内容。

### DSH profile 验证

```bash
dsh plugin --profile web add file:<repo>/packages/dsh-thinking-collapse
```

安装后重启 `dsh web`，刷新页面并验证：

1. reasoning 流式期间外层标题显示持续更新的“已处理 Ns”，内层 Think 默认折叠并显示最新一行；
2. 普通工具一开始就出现在外层活动体里，而不是先作为独立聊天行；
3. 本轮工具仍在跑且还没有正文时，外层保持展开，耗时包含整轮工具墙钟；
4. 正文出现或本轮工具都结束后外层自动折叠；header 只显示一条“耗时 Ns”和右侧箭头；
5. 点击外层后标题仍为“耗时 Ns”；分隔线下按原顺序显示 DSH Think 行和官方工具树；
6. 内层 Think 默认折叠，再点一次才显示该段思考正文；内层标题不是“耗时 Ns”；
7. 再次点击外层后标题不变并隐藏活动体；
8. 刷新后最近会话仍能从事件窗口恢复时长；
9. 审批 / 提问仍在编辑器；轨迹视图保持不变；
10. 没有思考、只有工具时，聊天流仍出现一条活动行（由该轮第一个被吸收的工具节点托管），而不是整轮消失。

真实模型调用可能产生用量，执行前单独确认。类型检查、构建、fixture 或组件测试都不能替代这条真实 Web 验证。

### 9.1 已完成的 live E2E

2026-08-14 已在 DSH `0.1.0-rc.6` 上完成思考折叠 live Web 验证；当时的视觉复核以仓库根目录的 [`design-qa.md`](../../design-qa.md) 为准。2026-08-15 在同一隔离 profile 上完成普通工具吸收验证。2026-08-16 将契约从「一步一条耗时」改为「整轮一条外层耗时」；同日先验证内层嵌套耗时行，随后改为内层恢复 DSH 默认 Think 行，并在隔离 profile `web-thinking-collapse-e2e`、`127.0.0.1:3082` 上用既有会话「查看仓库并总结README」复核：外层仍是一条「耗时 4秒」；展开后顺序为 Think（首行预览）→ Bash → Read → Think（首行预览），没有内层「耗时 Ns」；正文在行外。轨迹页仍是逐步 timeline（Request #1 / #2），未改。

## 10. 升级流程

升级 DSH 时必须：

1. 更新精确 peer dependency；
2. 固定新的 upstream commit 和 npm integrity；
3. 对比兼容副本涉及的上游文件与公共类型，包括 `tool.call.toolview`；
4. 重新核对 slot key、priority 和 Location data 契约；
5. 运行自动验证；
6. 在目标 DSH profile 重做完整流式 Web 验证，并包含一次普通工具请求。

在上述步骤完成前，不扩大 README 的兼容版本声明。
