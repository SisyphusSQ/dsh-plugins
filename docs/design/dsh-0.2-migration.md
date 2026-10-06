# DSH 0.1.0-rc.6 → 0.2.0-rc.2 迁移记录

本文件记录本仓库从 DSH `0.1.0-rc.6` 迁移到 `0.2.0-rc.2` 的完整过程：为什么必须迁移、四个仓库级根因、逐包 API 变更台账，以及当前验证状态与回滚方式。

各包的 `## 兼容边界` 小节指向本文件，不再各自重复。

## 1. 为什么必须迁移

DSH 在 0.1.7-rc.1 引入、0.2 线强化的 **peer 版本门禁**：安装期与启动期都会检查插件的 `@deepseek-ai/dsh*` peer 范围，不满足就禁用该行并输出 `disabling profile plugin row "<id>"`。

升级卡 `DSH-0.2.0-RC1-01` 给出的实测结论是：

| 结果 | 范围 |
|---|---|
| 被拒绝 | `^0.1.0`、`^0.2.0`、`^0.1.0 \|\| ^0.2.0` |
| 被接受 | `^0.2.0-rc.1`、`>=0.1.0 <0.3.0`、`>=0.1.0 <0.3.0-0`、`*` |

`^0.2.0` 同样被拒的原因：它展开为 `>=0.2.0 <0.3.0-0`，而发布候选版本 `0.2.0-rc.x` 小于 `0.2.0`。

本仓库原先在 peer 与 devDependencies 中**精确锁定** `0.1.0-rc.6`，因此在 `0.2.0-rc.2` 宿主上会被全部禁用。迁移后统一为：peer `^0.2.0-rc.1`、devDependency 精确 `0.2.0-rc.2`、`@deepseek-ai/cordis` `~4.0.4`。

> 走廊缺口：升级卡覆盖 `dsh-v0.1.0-rc.8` 起，且 `0.1.7-rc.1 → 0.1.7-rc.2` 一段尚未成卡。本次迁移由用户明确指示直接执行，未先跑 `dsh-upgrade-audit` 补卡；本文件即为事后记录，缺口仍在。
>
> 事后审计又确认了一条硬边界：**npm 版本集不等于 git tag 集**。`@deepseek-ai/dsh@0.1.0-rc.6` 在 registry 上存在，但仓库里**没有 `dsh-v0.1.0-rc.6` 标签**——上游 tag 集从 `dsh-v0.1.0-rc.7`（commit `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`）开始。
>
> 由此，本仓库原基线所在的那一步 `0.1.0-rc.6 → 0.1.0-rc.7` **无法用源码 tag 对比审计**，只能用 npm 模式；而 npm 模式在本机对这套依赖闭包物化失败（npm 解析阶段内存打爆，2.3 GB RSS 且磁盘零产出）。因此审计以 `dsh-v0.1.0-rc.7 → dsh-v0.2.0-rc.2` 为范围，`0.1.0-rc.6 → 0.1.0-rc.7` 一段标注为**未审计**。

## 2. 四个仓库级根因

这四类问题都不是「改版本号」能解决的，且前三类会**静默失效**（不报错、只是不生效）。

### 2.1 cohort 混用导致 declaration merging 失效（pnpm 双实例）

DSH 的客户端类型靠 declaration merging 扩展：`SlotMap`、`LocaleNamespaceMap`、`SessionStandardProps`、`GlobalStandardProps` 都是**故意留空的合并点**，由各包 merge 成员。

pnpm 的隔离布局下，同一个包若被解析到**两个不同的 peer 上下文**，就会产生两份物理副本，也就是两个互不相干的接口，合并静默失效。本次实测到两次：

- `@deepseek-ai/dsh-client-ui-slots@0.2.0-rc.2` 分别挂在 `cordis@4.0.1` 与 `cordis@4.0.4` 两个 peer 上下文中 —— 因为仓库里老包把 cordis 4.0.1 提到了根，而新包用 4.0.4。
- `@deepseek-ai/schemastery` 同时存在 `3.18.1` 与 `3.18.4` —— 表现为 `TS2742: The inferred type of 'Config' cannot be named without a reference to …`。

**处置**：全仓库统一 cordis `~4.0.4` 与 schemastery `^3.18.4`。迁移后 lockfile 中 `0.1.0-rc.6` 出现次数为 0。

### 2.2 上游包的运行时依赖漏声明

`@deepseek-ai/dsh-client-store@0.2.0-rc.2` 的构建产物导入 `zustand/vanilla`、`zustand/middleware`、`zustand/shallow` 与 `immer`，但其 `package.json` **没有 `dependencies` 字段**。消费方必须自行声明，否则运行时报 `Cannot find package 'zustand'`。

**处置**：使用该包的插件在 `dependencies` 中显式声明 `zustand@~4.4.7` 与 `immer@^10.1.1`。

### 2.3 库包被误列入 `dsh.client.inject`

`dsh.client.inject` 语义是「宿主需要组合并服务的客户端模块」，因此**只能列具备 `dsh.client` 声明的包**。以下三个是库包（无 `dsh.client`），经 shell bundle 进入模块图，不应出现在该列表：

- `@deepseek-ai/dsh-client-store`
- `@deepseek-ai/dsh-client-ui-slots`
- `@deepseek-ai/dsh-client-ui-primitives`

first-party 的 inject 列表无一包含它们。本次迁移中有四个插件违规，已全部移除；当前 32 条 inject 全部具备客户端半边。

### 2.4 重复挂载默认组合已挂载的模块

`dsh-session-tools` 的 bundle patch 原先 insert `@deepseek-ai/dsh-session-reference`。但 0.2 的默认 web-app bundle（`packages/bundle/web-app/cordis.patch.yml`）**已经**以行 id `session-reference` 挂载同一模块。同一模块挂两次会触发重复注册，属于会失败整棵插件树的形态。

**处置**：移除该冗余 insert，仅保留本包自身的行。该插件消费 resolver 服务，但不拥有它的行。

## 3. 共性 API 变更

| 旧（0.1.0-rc.6） | 新（0.2.0-rc.2） |
|---|---|
| `@deepseek-ai/dsh-client-runtime` 的 `ClientContext` | `@deepseek-ai/cordis` 的 `Context` |
| `@deepseek-ai/dsh-client-runtime`（整包） | **已删除**，其成员分散到 `ui-conversation` / `ui-chat` / `api-session-controller` 等 |
| `@deepseek-ai/dsh-host-apiproxy` | **已删除**；会话操作改走 `ctx.sessionController`（`dsh-api-session-controller`） |
| `ctx.slots` 由 `dsh-client-ui-slots` merge | 由 `dsh-client-ui-renderer/client` merge |
| `SessionListState.current` | 已移除；主视图会话改读 `ctx.uiSession.adapter.current`（快照 `key` 即会话 id） |
| `TypertLookupFailure` | `remoteErrorOf(error)` + `RemoteFailure`，按 `.code` 判别（跨 realm，不可 `instanceof`） |
| Remote 错误码用 `-` | 用 `/` 命名空间（`session/not-found`），移植时须同时折叠两种分隔符 |

## 4. 逐包变更台账

### 4.1 `dsh-agent-plugins`

- `ClientContext` → cordis `Context`；`ctx.slots` 的 merge 改由 `dsh-client-ui-renderer/client` 提供。
- 类静态 `Config` 补显式类型注解（`z<ResolvedAgentPluginsConfig>`）以消除声明产出中的不可命名类型。

### 4.2 `dsh-codex-login-dock`

- `SessionId` 改从 `dsh-client-connection/client` 导入。
- 标准 props（`sessionId`、`useSessions`、`useSession`、`useProjection`）由 `dsh-client-ui-session/client` merge；补该包依赖与类型边。
- `settings.section` 槽与设置 props 由 `dsh-client-ui-settings` 提供。
- **行为改动**：设置页原先用 `useSessions(list => list.current)` 取当前会话；0.2 已移除 `current`。改为 apply 侧订阅 `ctx.uiSession.adapter.current` 并镜像进注册的 store，组件通过 `useStore` 读取（框架规定的三条活数据通道之一）。

### 4.3 `dsh-composer-skill-mention`

- `ISessions` 改从 `dsh-api-session-controller/client`，`SessionId` 改从 `dsh-client-connection/client`。
- 测试 fixture 的消息来源 `kind: 'plugin'` 已从 `MessageSourceMap` 移除，改用 `'system-prompt'` 表达「非用户直接输入」。

### 4.4 `dsh-openai-codex-oauth`

- 纯 host 包，仅清单迁移；代码无改动。
- 其 bundle patch 对 `llm-pi-ai` 行做 **config 覆盖**（该行存在于默认组合），不是重新挂载。

### 4.5 `dsh-session-tools`

- `ctx.apiProxy.sessions.{create,rename,fork}` → `ctx.sessionController` 同名方法；`{rpcId,payload}` / `RpcResponse` 信封消失，改为直接传参返回值。
- `inject` 中的 `'apiProxy'` → `'sessionController'`（前者在 0.2 不再对应任何服务，保留即插件永不加载）。
- 新增 `callSessionsApi` 包装，把 `RemoteError` 折回原有的 `SESSION_TOOLS_API_*` 稳定错误码；错误码归一化同时折叠 `/` 与 `-`。
- 移除对 `dsh-session-reference` 的冗余挂载（见 2.4）。

### 4.6 `dsh-thinking-collapse`

变更面最大，共 17 类：

- `ClientContext` → cordis `Context`；`ConversationSnapshot` → `ui-chat` 的 `ChatSnapshot`（`snapshot.locations` / `snapshot.nodes`）。
- `ChatNode`、`ChatNodeViewProps`、`ChatViewSlotProps`、`TurnTailOwnerProps` 全部迁到 `dsh-client-ui-chat/client`。
- 节点 props 的 `useSession` → `useChat`；`ctx.conversationEvents.register` → `ctx.uiConversation.events.register`。
- `ImageLoader` / `ImageGallery` → 由 attachment 插件的 `conversation.message.images` 槽渲染（`renderMessageImages` owner prop），`image-labels.ts` 随之删除。
- 图标 `*14` 变体 → `*Regular`；`MarkdownText codeLabels` → `labels: MarkdownLabels`（需 memo，身份即流式缓存键）。
- 会话事件 `'assistant/chunk'` → `'assistant/live-chunk'`。
- `ToolCallOwnerProps` 由扁平结构改为 `preparing` / `start` / `result` 相位联合；`argsRaw` 仅存在于 `phase: 'start'`；`selectedCallId` 已移除。
- locale 键部分迁移到 `chat` 命名空间；`image.serviceUnavailable` 键消失。
- **判断性改动**：`tool.call.toolview` 的子槽由 ui-tool 拥有（第二次声明会抛错），而 0.2 的条目还带有只有渲染机才能绑定的 entry 级 inject 面（`useToolCallArgumentsPartial`、`useTodoHistory`）。手写分发路径在 `toolview.tsx` 中从相同的声明来源复现了这套绑定（约 60 行）。**这是复现框架管道，没有公开接缝；仅经类型检查与单测，未在真机验证。** 上游若开放正规接缝，应当替换。

### 4.7 `dsh-worktree-workspaces`

- `WorkspaceView` 改从 `dsh-api-workspace-controller/types`；`ctx.workspaces` 的类型边来自 `dsh-client-ui-workspace/client`。
- `CommandUiSpec` 变为判别联合（`PopupSelectSpec | ActionSpec`），测试按 `kind === 'popupSelect'` 收窄。
- `CommandInvocation` 新增必填 `attachments` 字段。
- `ctx.remote.commands.execute` 新增必填第三参。
- **行为改动**：`ctx.workspaces.connectWorkspace(id)` 与 `ctx.sessions.open(id)` 在 0.2 均已不存在（`ISessions` 不再有 `open`，"导航归视图所有者"）。二者合并为 0.2 的唯一后继 `ctx.uiWorkspace.openWorkspace(workspaceId)`。语义等价，但引入了对 Workspace UI 包的真实依赖。

### 4.8 `dsh-ui-zoom`（新增）

新包，直接按 0.2 契约编写，无迁移成本。详见 [dsh-ui-zoom.md](dsh-ui-zoom.md)。

## 5. 验证状态

| 层级 | 状态 |
|---|---|
| 类型检查 | 8/8 包 0 错误 |
| 单元 / 注册契约测试 | 8/8 包通过 |
| 构建与打包 | 8/8 包产出 tarball；`npm pack` 内容已审计（含 `lib/client.js`、`cordis.patch.yml`、`src/`） |
| peer 兼容性预测 | 用桌面版内置的 semver 7.8.5 逐包比对，8 个包的全部 DSH peer 在 `0.2.0-rc.2` 上均被接受 |
| 启动前静态校验 | 重复挂载 0 冲突；32 条 `dsh.client.inject` 全部具备客户端半边 |
| 运行时依赖可解析性 | 各插件客户端 bundle 的外部 `require` 与 first-party 包一致（实测对照：`ui-primitives` 被 47 个 first-party bundle require、`client-store` 34 个、`ui-slots` 7 个） |
| **真实 profile 冷启动 E2E** | **未执行**（已装入 desktop profile，等待重启） |

按仓库约定，类型检查、构建与 fixture 测试**不等于**真实 DSH Web/Headless E2E。上面最后一行是唯一未闭合的项。

## 6. 走廊审计结果

迁移完成后，用 `dsh-upgrade-audit`（源码模式）对 `dsh-v0.1.0-rc.7 → dsh-v0.2.0-rc.2` 做了一次独立复核。完整报告在 gitignored 的 `tmp/0.1.0rc7-to-0.2.0rc2/UPGRADE-ADAPTATION.md`，结论摘要如下。

**走廊规模**：8066 commits，纯度检查通过（`merge-base(rc.7, rc.2) == rc.7`，无基线漂移）。`packages/` 目录 226 → 325，90 个 revert 提交（集中在桌面安装器、plugin-manager、subagent 文案等外围面，核心契约未被撤回）。

**三项独立佐证了本次迁移的关键判断**：

| 审计发现 | 与本仓库的关系 |
|---|---|
| `packages/client/runtime` 被删除 | 正是 `@deepseek-ai/dsh-client-runtime` 消失的原因 → 入口类型改用 cordis `Context` |
| `packages/host/apiproxy` 被删除 | 正是 `ctx.apiProxy` → `ctx.sessionController` 的原因 |
| 默认组合移除 `client-runtime` 行、新增 `ui-renderer` / `session-reference` / `shortcuts` 等 34 行 | 解释了 `ctx.slots` 改由 `ui-renderer` 合并、以及 `session-tools` 重复挂载 `session-reference` 的成因 |

**两项新发现**（此前未知）：

1. **会话格式守卫 `SESSION_FORMAT_VERSION` 从 0 跳到 4**。存在已发布的迁移实现（v0→v1→…→v4）。这影响的是**用户的存量会话数据**，不是插件代码（本仓库插件一律经 host API 访问会话）。升级前应确认迁移已运行。
2. **`0.1.0-rc.6 → 0.1.0-rc.7` 一段无法审计**：该版本有 npm 包但没有对应 git tag，而 npm 模式在本机物化失败。详见第 1 节的边界说明。

## 7. 回滚

安装前已备份 profile 的 `package.json` 与 `pnpm-lock.yaml`。回滚：

```bash
bash /tmp/dsh-profile-backup/revert.sh
```

随后重启 DeepSeek Harness，即以不含 `@suqingsq/*` 的组合启动。
