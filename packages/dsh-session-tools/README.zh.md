# @suqingsq/dsh-session-tools

[English](README.md) | 中文

DeepSeek Harness 的会话能力插件。提供六个模型侧工具，并接入 Host 原生 Web `@` 引用，把会话作为带出处的上下文使用。

编译与包测试目标为 `@deepseek-ai/dsh@0.2.2-rc.1`，包含真实 Loader + AgentLoop + Session Controller 组合验证；不将其描述为 Web 或真实模型 E2E 验证。

当前源码版本要求 DSH `>=0.2.2-rc.1 <0.3.0`、Cordis `~4.1.0` 和 Node.js `>=24.9.0`；`read_session` 使用当前模型请求决定快照预算，并传递取消信号。

## 历史已发布版本

以下命令安装曾按 DSH `0.1.0-rc.6` 验证的旧版，不是尚未发布的当前源码适配版：

```bash
dsh plugin --profile web add @suqingsq/dsh-session-tools@0.2.0
```

卸载命令：`dsh plugin --profile web remove @suqingsq/dsh-session-tools`。

## 工具

这些工具只允许当前精确、正在运行且由 Agent Loop 驱动的 Root Agent 调用。Subagent 一律拒绝。跨会话消息使用 `source.kind = "session-relay"`，不会伪装成直接用户输入。

| 工具 | 行为 |
| --- | --- |
| `list_sessions` | 列出普通会话元数据（id、标题、cwd），不搜索正文。不含 subagent 会话。 |
| `read_session` | 将另一普通会话的受限、不可信快照附加到当前 step。工具调用、思考、内部上下文和未完成片段都会去掉。 |
| `create_session` | 通过 Host API 创建真实持久会话和 idle Agent。未显式覆盖时，校验并继承调用者当前有效 cwd（包括 `cd` 和目录恢复）及 agent preset。新会话不会自动被提问。 |
| `rename_session` | 使用与 Web 相同的业务 API 重命名当前会话或其他普通会话。 |
| `fork_session` | 指定 `at_seq` 时精确复制包含该事件的源日志前缀，并为未闭合尾部生成 Fork 结束事件，不复制更晚的源事件；省略时使用最近已完成轮次前缀。Host 保留源历史、目录变更、Workspace、lineage 和标题种子，并负责选择新 Agent 的模型。 |
| `send_message_to_session` | 给另一普通会话排队一个 follow-up turn，等待对方当前轮结束，只返回投递确认。 |

公开的 `createSessionToolDefinitions()` 工厂仍接受原有 services 结构。可选 `workingDirectory` 服务优先；未提供时，默认目录创建从已认证调用 Agent 的原生 Context 获取该服务。两者都缺失时明确报错，不回退旧 header 或进程 cwd；显式 `cwd` 无需目录服务。

## `@` 会话提及

默认 Web 路径使用 `@deepseek-ai/dsh-client-ui-reference`：单一 `reference` 提供者统一列出文件、目录、子智能体和会话候选。本包不再注册第二组 `session` 候选，也不重复挂载自己的 pre-step 提及适配器。

选中会话会生成原生会话引用 chip。原生 codec 在提交和剪贴板操作中保留规范 `@[标题](dsh-session:…)` 值。Host 的 `sessionReferenceResolver` 规范化直接用户提及，并把不可信、只读且带出处的快照放在引用消息之后；工具、推理和内部上下文不会变成引用正文。

人主动 `@` 不走 `read_session` 的 Approval，单纯 `@标题` 文本不是会话引用。模型主动调用 `read_session` 仍默认需要审批，并通过 `deferContext()` 附加快照；不会将快照提升为直接用户权威。

已导出的旧 `createSessionMentionSource`、`listSessionMentionCandidates` 仍供显式调用者使用。可选的 `injectMentionedSessionReferences` helper 现要求传入 `agent/pre-step` 捕获的 `modelSelection`，引用预算跟随当前 step 路由，而不是未来模型选择。候选与 source 工厂已标记 deprecated，默认路径不挂载它们；新集成应使用原生引用提供者，不要与原生提供者并排注册旧 source。

## 配置

以下字段属于 `session-tools` Cordis 行的 `config`：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `approveRead` | `true` | 读取其他会话快照前审批 |
| `approveCreate` | `true` | 创建会话前审批 |
| `approveRenameCurrent` | `false` | 重命名当前会话前审批 |
| `approveRenameOther` | `true` | 重命名其他会话前审批 |
| `approveFork` | `true` | Fork 前审批 |
| `approveSend` | `true` | 跨会话 relay 前审批 |

Approval 只有 `allowed-once` 会继续，其他回答全部失败关闭。

## 验证

包回归以 `@deepseek-ai/dsh@0.2.2-rc.1` 为目标。无需凭据的 Host 组合执行完整的消息 → 工具 → 回复流程，覆盖真实会话创建、有效 cwd 继承、精确未闭合前缀 Fork、审批审计事件、受限 sourced context、原生提及准备和 Loader 卸载清理。另有已发布客户端入口夹具验证单提供者注册及原生 chip/codec 行为；该夹具不渲染浏览器界面。

更早的产品验证记录见[设计文档](https://github.com/SisyphusSQ/dsh-plugins/blob/main/docs/design/dsh-session-capabilities.md)。

## License

[MIT](LICENSE)
