# dsh-session-tools

DeepSeek Harness 的模型侧会话能力插件。它提供六个真实工具，并对读取、生命周期变更和跨会话投递执行 Root Agent 权威校验与可配置 Approval。

状态：实验中，尚未发布到 npm。

## 工具

| 工具 | 行为 | 默认审批 |
| --- | --- | --- |
| `list_sessions` | 列出普通会话元数据；不搜索正文 | 否 |
| `read_session` | 将另一会话的受限、不可信快照延迟注入当前轮次 | 是 |
| `create_session` | 通过 Host ApiProxy 创建真实持久会话和 idle Agent | 是 |
| `rename_session` | 使用与 Web 相同的业务 API 重命名会话 | 当前会话否，其他会话是 |
| `fork_session` | 在已完成轮次边界 Fork 会话 | 是 |
| `send_message_to_session` | 给另一普通会话排队一个带来源的独立 follow-up turn | 是 |

工具仅允许当前精确、正在运行且由 Agent Loop 驱动的 Root Agent 调用。Subagent 始终拒绝。跨会话消息使用 `source.kind = "session-relay"`，不会伪装成直接用户输入。

## 本地构建与安装

要求 Node.js 22、pnpm 10，并已安装 `@deepseek-ai/dsh@0.1.0-rc.6`。

```bash
pnpm install
pnpm --filter dsh-session-tools test
pnpm --filter dsh-session-tools pack --pack-destination /absolute/output/directory
dsh plugin --profile web add /absolute/output/directory/dsh-session-tools-0.1.0.tgz
```

安装会把本包及 `@deepseek-ai/dsh-session-reference` 追加到所选 profile。`pnpm` 目前会对 DSH 提供的 peer dependencies 给出缺失提示；rc.6 的 DSH profile loader 会从 DSH 自带包树解析这些依赖，真实启动已验证。不要为了消除提示把 DSH 服务包复制为普通 dependencies。

卸载：

```bash
dsh plugin --profile web remove dsh-session-tools
```

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

Approval 只有 `allowed-once` 会继续，其他回答全部失败关闭。关闭审批字段只适合由部署者明确接受对应风险的受信环境，不会放宽 Root Agent 限制。

DSH rc.6 的 `approval.policy=never`（Web 的 Full access preset）会自动拒绝所有 Approval request，而不是自动批准。因此，受信 Full access 部署若保留本插件默认的 `approve*=true`，对应写工具会按失败关闭语义被拒绝；要启用这些动作，部署者必须在插件配置中显式关闭对应审批字段。`workspace-write` / `ask` 可以保留默认值，并通过 UI 选择 `允许一次`。

## 兼容与证据边界

| DSH 版本 | 状态 | 已验证 |
| --- | --- | --- |
| `0.1.0-rc.6` | 本地兼容 | typecheck/build、17 个 Node 测试、npm tarball 内容、隔离 `web` profile 安装、插件树合成、真实 Web 启动与模型六工具调用、热/冷 relay、`session-relay` 来源、`session-reference` 注入、Fork lineage、Workspace Write Approval UI 与 asked/decided 审计 |

以上是 `dsh-session-tools` 的真实 DSH Web E2E。分屏和 `@会话` Client 包仍未实现或验证，npm registry 发布验证也未完成，因此该结论不构成整个路线图完成或发布证明。

完整的权威、生命周期、relay、分屏 Core 契约和剩余验收项见[设计文档](../../docs/design/dsh-session-capabilities.md)。
