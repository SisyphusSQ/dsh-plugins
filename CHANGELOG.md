# ChangeLog

本文件记录 dsh-plugins 的用户可感知变更与正式发布历史。尚未发布的内容保留在 `Unreleased`，正式版本以对应 Git tag、GitHub Release 或 npm registry 状态为准。

## Unreleased

- breakingChange
  - 2026-11-05 将现存三个插件源码适配 DSH `0.2.2-rc.1`，最低 Node.js 提升到 `24.9.0`、Cordis 提升到 `~4.1.0`；DSH peer 起点为 `^0.2.2-rc.1`，不再声明支持旧 cohort。源码版本为 Session Tools `0.4.0`、UI Zoom `0.2.0`、实验性 Codex Bridge `0.2.0`，尚未发布。
  - 可选导出 helper `injectMentionedSessionReferences` 新增必需的当前 step `modelSelection`；默认原生 `@session` 链不受该 helper 调用签名影响。
- bugFix
  - Session 引用快照显式传入当前模型请求路由并保留取消信号，避免目标 resolver 参数错位或误用未来模型选择。
  - Bridge turn 边界改由 owning AgentRegistry handle 读取，适配异步 session projection；真实组合显式装配 native batch executor 并验证工具 scope 隔离。
  - Zoom 校正目标 anchored viewport 的像素上限与 anchor min-width，修复逐属性重复缩放、动态 zoom 重算和卸载恢复；不改写 Host 原生 placement 算法。
- note
  - 本轮 API 破坏、RED/GREEN 与产品验收边界见 [DSH 0.2.2 迁移记录](docs/design/dsh-0.2.2-migration.md)。Fixture、真实 Loader/native kernel 与 Chrome DOM 证据不替代日常 Web 或真实模型服务商验收；下文保留先前迭代的历史，不代表恢复退役插件或重复部署。

- deprecated
  - 2026-11-04 退役 `@suqingsq/dsh-worktree-workspaces` 并从 `packages/` 删除，停止维护其斜杠命令、模型工具、CLI 与 Web 工作树选择器；当前维护集为 `dsh-session-tools`、`dsh-ui-zoom`，另保留实验性、未发布的 `dsh-codex-bridge`。
  - 移除当前 README 安装示例和包索引中的 Worktree 插件；设计与迁移记录保留为历史。下列先前适配、验证与发布记录不代表退役后仍提供该包，也不表示此次修改了 npm registry 状态。

- breakingChange
  - `dsh-worktree-workspaces` 提升为 `0.4.0`：公开客户端 `worktreeOptions` 新增必需的 `WorktreeLocation`，`waitForWorkspace` 改接收 `{ workspaceId, path }` 回执而非标题。调用方通过公开 protocol helpers 解析 Host 命令结果；默认 Web 路径已迁移，不保留按标题猜测的降级。
- bugFix
  - 修正 `dsh-session-tools` 与 `dsh-worktree-workspaces` 默认读取会话初始目录的问题；改用 Host 有效工作目录，避免切换目录后在旧仓库创建会话或工作树。
  - 修正 `fork_session` 对 `at_seq` 的说明与审批文案：显式值按 Host 原生 inclusive event prefix 精确截断；省略时才选择最新已完成轮次，不再承诺把显式序号推进到后续 `turn/end`。
  - 将 Worktree Host 文件与 Git 执行接入调用会话的沙箱；保留独立 CLI 的本地执行边界。
  - Worktree Workspace 创建与复用改按稳定身份导航，不再依赖用户可重命名的显示标题。
  - `codex_agent` 委派读取 Host `maxDepth`，同一次操作的预检与子代理请求使用同一上限。
  - 修正整体界面缩放在连续点击时被旧 Host describe 回灌覆盖新意图的问题；最新写入完成后再收敛，拒绝或断线显示失败并恢复最近确认值，卸载后的迟到结果不再回写。
- optimization
  - 将四包开发依赖及 Bridge 的运行时 `dsh-hook-protocol` 对齐到 DSH `0.2.1-rc.5`；收敛默认 `@session` 候选与注入到宿主原生 reference 能力。
  - 本轮源码版本为 session-tools `0.3.3`、worktree-workspaces `0.4.0`、codex-bridge `0.1.2`、ui-zoom `0.1.7`；未发布 npm、tag 或 Release。
- note
  - 本轮适配与验证边界见 [docs/design/dsh-0.2.1-rc.5-adaptation.md](docs/design/dsh-0.2.1-rc.5-adaptation.md)。已确认缺陷在旧基线存在，不表述为 rc.5 新引入的破坏。

- feature
  - 新增 `@suqingsq/dsh-ui-zoom`：DSH 整体界面缩放，入口为设置页「整体界面缩放」行（−/+ 与重置），以及可写入 profile 的 `zoomPercent` 长期默认值。缩放作用于文档元素，因此菜单、弹窗、toast 等 portal 浮层一并缩放。
    - 解决 CSS `zoom` 放大绝对长度带来的两处错乱：视口单位被再次相乘导致外壳溢出（115% 下 720→828px，底部吸附的账号区与菜单被推出窗口），以及用 `getBoundingClientRect()` 定位的浮层偏移被二次缩放。前者由注入样式把外壳尺寸除以倍数抵消，后者由 `MutationObserver` 把内联偏移除以倍数还原。
    - 未提供键盘快捷键：首版曾注册 `Cmd/Ctrl` + `=` / `-` / `0`，但在桌面端实测不触发，已按用户决定移除，设置行是唯一入口。
  - 新增实验性只读包 `@suqingsq/dsh-codex-bridge@0.1.1`（未发布）：把 Codex Home（默认 `~/.codex`）的 skills、plugins、全局 AGENTS 指令、TOML agent 角色委派与免凭据 MCP/同步 hooks 导入 DSH。导入按整类开关默认关闭，含凭据的 MCP/hook 配置在连接前被阻止并要求在 DSH 独立配置；不读取 Codex 凭据、不写 Codex Home。设计与边界见 [docs/design/codex-home-bridge.md](docs/design/codex-home-bridge.md)。
- optimization
  - 将仓库内七个包从 DSH `0.1.0-rc.6` 迁移到 `0.2.0-rc.2`：DSH peer 改为 `^0.2.0-rc.1`（`^0.1.x` 与 `^0.2.0` 都会被 0.2 宿主拒绝），`@deepseek-ai/cordis` 统一 `~4.0.4`，devDependencies 精确钉 `0.2.0-rc.2`。
  - 移除 0.2 已删除的 `@deepseek-ai/dsh-client-runtime` 与 `@deepseek-ai/dsh-host-apiproxy`，补齐其 0.2 替代包（`dsh-api-session-controller`、`dsh-api-workspace-controller`、`dsh-client-ui-workspace`、`dsh-client-ui-chat`、`dsh-client-ui-renderer`、`dsh-client-ui-session`、`dsh-client-ui-settings`）。
  - 客户端入口类型从已删除的 `ClientContext` 改为 Cordis 的 `Context`；`ctx.slots` 改由 `dsh-client-ui-renderer` 合并。
  - 将 `@deepseek-ai/schemastery` 全仓库统一到 `^3.18.4`，消除 3.18.1 / 3.18.4 双实例导致的 declaration merging 静默失效与 `TS2742`。
  - 为使用 `@deepseek-ai/dsh-client-store` 的包显式声明 `zustand` 与 `immer`：该包构建产物会导入二者，但自身未声明运行时依赖。
  - 将仓库源码从 DSH `0.2.0-rc.2` 迁移到 **`0.2.1-rc.2`**（当前桌面宿主；npm `next` 指向该版本）：四个包（含在制包 `dsh-codex-bridge`，本次一并纳入仓库）的 `@deepseek-ai/dsh*` peer 改为 `^0.2.0-rc.1 || ^0.2.1-rc.2`，新增 `engines.dsh: ">=0.2.0-rc.2 <0.3.0"`，`@deepseek-ai/cordis` 统一 `~4.0.5`、`@deepseek-ai/schemastery` 统一 `^3.18.5`，devDependencies 精确钉 `0.2.1-rc.2` 并重算 lockfile。
    - 版本号：`dsh-session-tools` 0.3.2、`dsh-worktree-workspaces` 0.3.1、`dsh-ui-zoom` 0.1.4、`dsh-codex-bridge` 0.1.1（本次随迁移一并提交，仍未发布）。
    - `dsh-codex-bridge` 代码适配：`ctx.subagents.start()` → `startActivation()` + `dispose()` 取消语义；被删除的 `persona` 改为把 Codex `developer_instructions` 作为子任务简报前置到 prompt（语义降级）；移除 `ConfigFormSnapshot.mode`；`@deepseek-ai/dsh-hook-protocol` 从 peer 改为运行时依赖（0.2.1 桌面 runtime 未打包该包，否则真实 Web 冷启动整包加载失败）；测试补齐 `workingDirectory` seam、`RemoteAccessService` + `Peer`、0.2.1 原生实现 fixture。
    - 依据与台账见 [docs/design/dsh-0.2.1-migration.md](docs/design/dsh-0.2.1-migration.md)。
- deprecated
  - 退役五个包并从 `packages/` 删除：`@suqingsq/dsh-agent-plugins`、`@suqingsq/dsh-thinking-collapse`、`@suqingsq/dsh-codex-login-dock`、`@suqingsq/dsh-openai-codex-oauth`、`@suqingsq/dsh-composer-skill-mention`。仓库保留 3 个包：`dsh-session-tools`、`dsh-worktree-workspaces`、`dsh-ui-zoom`。
    - 退役依据：`dsh-thinking-collapse` 是宿主 chat 渲染的 fork，每次 DSH 升级都要重新对齐上游 commit 并做真机流式验证；`dsh-agent-plugins` 体量最大（3069 行 / 30 个测试 / 唯一 `yaml` 运行时依赖），且它管理的 `~/.dsh/agent-plugins` 与 data 目录都不存在、生成的 home 托管块为空；Codex 登录对（`dsh-codex-login-dock` + `dsh-openai-codex-oauth`）在 `~/.dsh/.credentials.yaml` 中没有任何 codex/openai 凭据；`dsh-composer-skill-mention` 为最小包。
    - 本地处置：desktop profile 的 `dependencies` 与 `dsh.profile.bundles` 各移除 5 行后重装，`@suqingsq` 回读为 3；`~/.dsh/cordis.patch.yml` 中 agent-plugins 生成的托管块已清除。
    - npm 侧未做任何操作：已发布版本（`0.2.0`）保持原样，既未 deprecate 也未下架；三个旧 unscoped 包的弃用消息仍指向已退役的 scoped 包名。
  - 移除 `README` 与 `packages/README` 中退役包的小节与安装命令（7 条 → 2 条），并把 `dsh-ui-zoom` 的能力描述改为与实现一致：不含键盘快捷键。
- note
  - 迁移后退役前，八个包全部通过 typecheck（0 错误）与各自测试套件；退役后保留的 3 个包重新通过 typecheck 与测试。
  - 八个包曾装入本机 desktop profile，真机冷启动验收记录按包写入对应 `docs/design/`；退役 5 个后 desktop profile 回读为 3 个 `@suqingsq` 行，`ui-zoom` 的 `zoomPercent: 115` 配置行保留。
  - 本轮变更尚未发布到 npm；`dsh-ui-zoom` 为首次引入，发布前 README 不写安装命令与 registry 包名。
  - 0.2.1-rc.2 迁移后四个包全部通过 typecheck（0 错误）、构建与测试；`dsh-codex-bridge` 的 opt-in 原生组合测试在真实 0.2.1 Agent loop/spawn 上通过；`dsh web` profile 真机加载结果记录在 [docs/design/dsh-0.2.1-migration.md](docs/design/dsh-0.2.1-migration.md)。
  - 日常 desktop profile 已在本机更新到上述版本并在重启后验证（desktop profile 由 Electron 独占管理、CLI 不能代改，本次直接修改 profile 依赖后用宿主自带 pnpm 安装，属一次性本地操作）；真实 `dsh web` profile 中也保留了四个插件作为验证状态。

## History

### v0.2.0(20260818)

- feature
  - 首次发布 `@suqingsq/dsh-codex-login-dock@0.2.0`，在 DSH Web 会话输入区和设置页提供 Codex 订阅登录状态、silent 浏览器登录、取消与退出入口。
  - 首次发布 `@suqingsq/dsh-openai-codex-oauth@0.2.0`，维护 `openai-codex` 的 OAuth 凭据、PKCE 登录、请求前 refresh、斜杠命令和供 Web 登录界面使用的 Host silent 服务。
- optimization
  - 将仓库内全部七个 npm 包统一迁移到 `@suqingsq/*@0.2.0`；Cordis bundle module name 与 Web client module ID 同步使用 scoped 包名，既有稳定配置行 ID 保持不变。
  - `dsh-codex-login-dock` 改为直接使用 OAuth Host 服务，不再依赖 live agent 或通过会话命令触发登录。
- deprecated
  - 弃用 `dsh-agent-plugins`、`dsh-composer-skill-mention`、`dsh-session-tools`、`dsh-thinking-collapse` 和 `dsh-worktree-workspaces` 的全部 unscoped 历史版本；registry 弃用消息指向对应的 `@suqingsq/*@0.2.0`。
- script
  - 新增 monorepo npm 包发版 Skill，统一包检查、发布和 registry 回读流程。
- note
  - 七个 scoped 包均完成 npm registry 版本、`latest`、integrity、shasum 与 tar 内容回读。
  - 日常 DSH `web` profile 已迁移至七个 scoped 包；在 `@deepseek-ai/dsh@0.1.0-rc.7` 上回读到全部插件 `enabled: true`、`fiberPhase: active`，旧 unscoped 模块为零。

### dsh-thinking-collapse v0.2.0(20260817)

- optimization
  - 将同一轮的思考与普通工具调用收进一条外层活动行，并保留内层 Think 行与正文边界。
- note
  - `dsh-thinking-collapse@0.2.0` 已发布到 npm registry，`latest` 已指向该版本。

### v0.1.0(20260815)

- feature
  - 发布 `dsh-agent-plugins@0.1.0`，提供 Agent Plugins 适配、CLI、Skill/MCP 注册和 Web 管理面板。
  - 发布 `dsh-composer-skill-mention@0.1.0`，支持在 Web composer 中用 `$` / `￥` 选择并注入 Skill。
  - 发布 `dsh-session-tools@0.1.0`，提供六个会话工具和 Web `@` 会话上下文注入。
  - 发布 `dsh-thinking-collapse@0.1.0`，提供 Codex 风格的思考与普通工具活动折叠行。
  - 发布 `dsh-worktree-workspaces@0.1.0`，提供 Git linked worktree 创建、归档、CLI、模型工具和 Workspace 选择器。
- note
  - 首发版本要求 Node.js 22 或更高版本，兼容基线为 `@deepseek-ai/dsh@0.1.0-rc.6`。
  - 五个 npm 包均完成 registry 版本、integrity、`latest` 与 DSH Web profile 安装结果回读。
