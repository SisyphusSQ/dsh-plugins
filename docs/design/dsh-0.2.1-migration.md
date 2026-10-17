# DSH 0.2.0-rc.2 → 0.2.1-rc.2 迁移记录

本文件记录本仓库从 DSH `0.2.0-rc.2` 迁移到 `0.2.1-rc.2` 的过程：为什么升级、走廊依据、逐包变更、验证结果与回滚方式。上一段 rc.6 → 0.2.0-rc.2 见 [dsh-0.2-migration.md](dsh-0.2-migration.md)。

## 1. 为什么现在升级

2026-10-17，日常桌面宿主（macOS Desktop）自动升级到 **DSH 0.2.1-rc.2**，与仓库源码当时的目标线 `0.2.0-rc.2` 之间隔了 `0.2.1-alpha.1 → alpha.5 → rc.1 → rc.2` 一整段走廊。npm 的 `latest` 仍是 `0.2.0-rc.2`，`next` 才是 `0.2.1-rc.2`；本仓库跟随**实际运行宿主**，目标定为 0.2.1-rc.2，同时让声明范围继续覆盖 0.2.0-rc.2。

## 2. 走廊依据与缺口

`.agents/skills/plugin-upgrade` 的升级卡只覆盖到 `0.2.0-rc.1`，没有 0.2.1 的卡片。本次没有编造卡片，而是并列三类一手证据：

1. GitHub Releases `dsh-v0.2.1-alpha.1` … `dsh-v0.2.1-rc.2` 的完整变更说明；
2. 目标 tag 源码里的官方升级指南 `docs/upgrade-guide/<from>/**/guide.md`（目录名是 **from** 版本，正文描述下一版变更；该 tag 内共 40 篇位于本走廊）；
3. `@deepseek-ai/*` 包在 `0.2.0-rc.2` 与 `0.2.1-rc.2` 两版的 `package.json` / `lib/**/*.d.ts` / 关键运行时实现逐包对比。

完整的只读审计记录（302 行，含逐条 guide 对照与行号证据）在本地 `tmp/audit-0.2.1-corridor.md`，`tmp/` 为 gitignore；结论已收敛到本文。

## 3. 兼容门禁实测

0.2.1-rc.2 宿主的门禁实现在 `@deepseek-ai/dsh-app-boot` 的 `plugin-compatibility.ts`：

- 若包声明 `engines.dsh`，**只**按它判定，`@deepseek-ai/dsh*` peer 被忽略；否则逐包检查 peer；
- 两侧都用宿主内置的 `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`。

用宿主自带的 semver 7.8.5 实测（runtime = `0.2.1-rc.2`）：

| 声明 | 结果 |
|---|---|
| `@deepseek-ai/dsh-agent`: `^0.2.0-rc.1` | **接受** |
| `@deepseek-ai/dsh-agent`: `^0.2.1-rc.2` | **接受** |
| `@deepseek-ai/dsh-agent`: 精确 `0.2.0-rc.2` | **拒绝**（`incompatible-version`） |
| `engines.dsh`: `>=0.2.0-rc.2 <0.3.0` | **接受**，且存在时取代 peer 判定 |

后者是本次必须处理 `dsh-codex-bridge` 的原因：它原来 18 个 DSH peer 全部精确钉 `0.2.0-rc.2`，在 0.2.1-rc.2 上会被判为不兼容；它是 bundle，整包会被 skip，不挂载任何 patch 行。

## 4. 仓库级变更

四个包（三个已跟踪包 + `dsh-codex-bridge`，本次一并纳入仓库）：

| 项 | 旧 | 新 |
|---|---|---|
| 插件版本 | 0.3.1 / 0.3.0 / 0.1.3 / 0.1.0 | **0.3.2 / 0.3.1 / 0.1.4 / 0.1.1** |
| `@deepseek-ai/dsh*` peer | `^0.2.0-rc.1`（codex-bridge 为精确 `0.2.0-rc.2`） | `^0.2.0-rc.1 \|\| ^0.2.1-rc.2`（联合范围同时满足旧宿主、`includePrerelease` 宿主与 pnpm 默认 semver） |
| `engines.dsh` | 无 | `>=0.2.0-rc.2 <0.3.0`（0.2.1-alpha.4 起优先判定；旧宿主忽略） |
| `@deepseek-ai/cordis` | `~4.0.4` | `~4.0.5`（宿主实发 4.0.5，避免双实例） |
| `@deepseek-ai/schemastery` | `^3.18.4` | `^3.18.5`（host 的 0.2.1 包写 `~3.18.5`） |
| DSH devDependencies | 精确 `0.2.0-rc.2` | 精确 `0.2.1-rc.2` |
| `pnpm-lock.yaml` | — | 按 0.2.1-rc.2 cohort 重算 |
| `@deepseek-ai/dsh-hook-protocol`（仅 codex-bridge） | `peerDependencies: ^0.2.0-rc.1 \|\| ^0.2.1-rc.2` | **`dependencies: 0.2.1-rc.2`**（见 §5.4 第 5 点） |

没有删除或改名任何 DSH 依赖包；四包都未使用已移除的 `@deepseek-ai/dsh-invariants` / `./invariant`，也未注册被删除的 `stats` 组合器行、`both` 工具展示模式或被移除的组合行。

## 5. 逐包变更台账

### 5.1 `dsh-session-tools`（0.3.1 → 0.3.2）

仅版本号与公共依赖：11 个 DSH 依赖中插件实际 import 的符号全部仍在，相关声明只有追加（如 `SessionCreateRequest.agentPreset`、`SessionForkRequest.allowMigration`、`SessionSummary.formatStatus`、`InputTriggerSource.matchClaim?`）。`SessionListState` 结构、`readTitleSnapshots`、`@session` 注入所用 `agent/pre-step` 事件均未变。

### 5.2 `dsh-worktree-workspaces`（0.3.0 → 0.3.1）

仅版本号与公共依赖：`openWorkspace(id, …)`、`WorkspaceView`、`ctx.commandUi.decorate`、`CommandDefinition` 均兼容（新增参数都是可选尾参）。0.2.1 新增的官方实验 worktree 包默认不挂载，行 id（`worktree-workspaces`）与工具名（`worktree_create`）都不冲突。

### 5.3 `dsh-ui-zoom`（0.1.3 → 0.1.4）

仅版本号与公共依赖：`configForms` / `ConfigForm`、`PropsRuntime`/`PropsStore`/`PropsLocale`、`settings.general.item` 槽、`webserver/index-inject` 全部保留；`dsh-settings` 声明零变化。桌面端 0.2.1 新增的 `Cmd/Ctrl + =` 字号快捷键与插件无关（本插件不注册任何键盘命令，见 [dsh-ui-zoom.md](dsh-ui-zoom.md)）。

### 5.4 `dsh-codex-bridge`（0.1.0 → 0.1.1，在制包，本次一并提交）

需要真实代码改动，共四处：

1. **subagent 激活 API 重写**：`ctx.subagents.start('spawn', request)` 已移除，改为 `ctx.subagents.startActivation({ provider, label, request, signal, delivery: 'caller' })`；发布后的取消从 "abort 传入 signal" 改为 `activation.dispose()`。`reconcile()` / `close()` 现在先 abort 发布前的 signal，再 dispose 已发布 activation。
2. **`persona` 字段移除**：`SubagentStartRequest` 不再接受 `persona`（与 `toolFilter` 一起删除）。Codex 角色的 `developer_instructions` 改为拼在子代理任务消息前部作为任务简报（`instructions + "\n\n---\n\n" + prompt`）；这是**语义降级**（原先是 persona/系统级注入，现在是用户消息文本）。同时删除了原先针对 persona 模板语法的拒绝逻辑——文本不再经过宿主模板求值，`{{…}}` 保持字面量。
3. **`ConfigFormSnapshot.mode` 移除**：设置页 store 的初始快照不再带 `mode: 'host'`。
4. **测试适配新宿主**：`SubagentRuntime` 新增 `workingDirectory` 硬依赖（seam 测试用最小 provider 补齐），`TypertGatewayService` 新增 `remoteAccess` 依赖且 `invoke` 需要 admitted `Peer`（diagnostics 测试补 `RemoteAccessService` + `Peer`）；opt-in 原生角色测试的 fixture 准备脚本改为从 `devDependencies` 读取目标版本，0.2.1 已把原 `dsh-subagent-in-process-driver` 合并进 spawn provider，组合中补 `fs-local` 与 `working-directory` 行。
5. **`@deepseek-ai/dsh-hook-protocol` 改为运行时依赖**：0.2.1 桌面 runtime 的安装范围（`app.asar/dsh/node_modules`，307 个 `@deepseek-ai/*` 包）里**没有**任何 `dsh-hook*` 包；profile 又是 `autoInstallPeers: false`，peer 不会自动安装。原实现把它当 peer，导致真实 Web 冷启动时 `lib/index.js → hooks.js` 静态 import 失败，整个 bundle `1 entry did not activate`。改法：声明为 `dependencies`（profile 安装 tarball 时由 pnpm 一并安装，DSH 解析器即可从 profile 范围解析），同时保留本地 devDependency 需求已由 dependencies 满足。官方在树内 `hooks-claude-code` 仍用 peer，是因为官方 profile 会显式安装该 peer；外部插件用普通依赖更自包含。

## 6. 验证

| 层 | 结果 |
|---|---|
| 基线（迁移前，0.2.0-rc.2 依赖） | `pnpm -r typecheck` 0 错误（四个包） |
| `pnpm -r typecheck`（0.2.1-rc.2） | 0 错误（四个包） |
| `pnpm -r build` | 通过（host + client 产物） |
| `pnpm -r test` | 通过：codex-bridge 57 项（56 pass / 1 项 opt-in skip，见下），其余三包套件全绿 |
| opt-in 原生组合测试（真实 0.2.1 Agent loop/spawn + 脚本模型） | 通过：`codex_agent` 真实 `startActivation` 子代理、instructions 进入子请求、`subagent/start`/`end` 配对、卸载时 abort 子模型流且不发布迟到结果 |
| 真实 `dsh web` profile（0.2.1-rc.2 宿主，3080） | **4/4 通过**：四条 `dsh plugin --profile web add <tgz>` 均 exit=0，无 `incompatible-version`；`--dump-config` 四个 `@suqingsq` 行均启用；冷启动日志无 `incompatible` / `waiting for services` / `did not activate` / 模块解析失败；boot manifest 与 client artifact 均能证明四个插件注册（session-tools 4179 B、worktree 6345 B、ui-zoom 16590 B 且首页 `<head>` 起始注入 `<style>:root{zoom:1}</style>`、codex-bridge 11244 B 且 `suqingsqCodexBridge` 可见）。codex-bridge 第一轮因缺 `dsh-hook-protocol` 失败，改为运行时依赖后复验通过。 |
| 真实桌面宿主（0.2.1-rc.2，本地 profile 更新后重启） | **4/4 加载**：重启后渲染器 boot 模块清单含四个 `@suqingsq/*/client.js`；`codex_home_catalog` 工具实际调用成功（返回导入的 Codex Home skills/plugins/MCP 状态，含凭据的 MCP 按设计 blocked），`codex_agent` 工具已注册；desktop profile 依赖与 `node_modules` 回读为 0.3.2 / 0.3.1 / 0.1.4 / 0.1.1 + `dsh-hook-protocol` 0.2.1-rc.2 |

说明：`tmp/` 审计产物、构建输出、tarball 都是本地工件，不进入版本库。

## 7. 残余风险与边界

- **desktop profile 的更新路径不可复现**：本轮把四个插件更新进日常 desktop profile 用的是一次性本地操作（直接改 profile `package.json` + 宿主自带 pnpm 安装），因为 CLI 明确拒绝代管 Electron profile；已在重启后验证。其他机器或其他会话应走插件页的卸载 + 重装 tarball 流程，不能依赖这次的手工状态。
- **0.2.0-rc.2 旧宿主未重跑**：`engines.dsh` 与联合 peer 范围覆盖旧宿主，但本轮只在新宿主上做了真实验证；旧宿主的回退验证未执行。
- **Codex 角色指令语义降级**：`developer_instructions` 从 persona 变为任务简报文本，模型看到的层级不同；这是 0.2.1 删除 `persona` 后不引入私有 preset 的取舍。
- **hook-protocol 版本耦合**：codex-bridge 现在随包携带 `@deepseek-ai/dsh-hook-protocol@0.2.1-rc.2`，其 peer 又精确要求同版 `dsh-shell`/`dsh-session`。DSH 升级时这个依赖必须与 devDeps 一起同步抬升；否则会出现协议副本与宿主版本错配。
- **验证环境状态**：真实 Web 验证把四个插件装进了日常 `web` profile（`~/.dsh/profiles/web`），并因供应键策略把 hook-protocol 写入该 profile 的 `minimumReleaseAgeExclude`；这是验证留下的环境状态，可用 `dsh plugin --profile web remove <name>` 清理。
- **`dsh-mcp-client` 依赖抬升**：`@modelcontextprotocol/client` 2.0.0 → 2.2.0，公开类型无变化；codex-bridge 的 stdio/HTTP MCP 测试在本轮全部通过，但生产 Loader + 认证组合仍未被本仓库真实覆盖。
- **ui-zoom 与桌面字号快捷键语义重叠**：0.2.1 把 `Cmd/Ctrl + =` 绑成宿主字号调整，插件不注册快捷键，二者不冲突；但"宿主字号"和"整界面 zoom"是两套机制。
- **未发布**：本次没有任何 npm 发布、registry 写入或 Git tag；四个包的新版本都还是仓库内版本。

## 8. 回滚

- 源码回滚：切回 `main`（或删除/重命名分支 `chore/dsh-0.2.1-rc.2-migration`），恢复 `package.json`/lockfile 到 `0.2.0-rc.2` cohort，`pnpm install` 后重建。
- 日常 desktop profile 已在 2026-10-17 20:13 更新到 0.1.1 / 0.3.2 / 0.3.1 / 0.1.4；回滚用 `~/.dsh/profile-backups/desktop-20261017-201338/` 的备份覆盖 `~/.dsh/profiles/desktop/{package.json,pnpm-lock.yaml,pnpm-workspace.yaml,cordis.patch.yml}`，再在 profile 内用宿主自带 pnpm 安装并重启桌面端。`dsh web` profile 用 `dsh plugin --profile web remove <name>` 或重装旧 tarball 回退。
- 桌面宿主自身是否回退到 0.2.0-rc.2 不属于本仓库范围。
