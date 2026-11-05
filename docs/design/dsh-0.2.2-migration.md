# DSH 0.2.2-rc.1 适配记录

日期：2026-11-05。范围为当前维护的 Session Tools、UI Zoom，以及实验性 Codex Bridge；不恢复已退役包。本次是源码适配，不是 registry 发布或日常 profile 部署。

## 版本与证据边界

- 回滚基线：`81cfbcba295c4f8e24c3131a162a9da84c3787f0`，适配前已提交并推送 `origin/main`；工作分支为 `adapt-dsh-022`。
- npm `latest` 与 `next` 均解析为 `0.2.2-rc.1`；对应 [dsh-v0.2.2-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1)，Git SHA `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`。旧源码 cohort 为 `0.2.1-rc.5`，SHA `b830ec950faba0a46dda564be3e2d854afed94f1`。
- 开发依赖与 Bridge 运行时 `dsh-hook-protocol` 精确钉在 `0.2.2-rc.1`；DSH peers 为 `^0.2.2-rc.1`，`engines.dsh` 为 `>=0.2.2-rc.1 <0.3.0`。这不是对未来版本逐个验收的承诺。
- Cordis 为 `~4.1.0`；include/group/loader 对齐 `~1.1.0`，Schemastery 为 `^3.19.0`；Node.js 最低版本提升至 `24.9.0`。不再声明兼容旧 cohort。
- 源码版本分别为 Session Tools `0.4.0`、UI Zoom `0.2.0`、Codex Bridge `0.2.0`。根文档保留的 Session Tools `0.2.0` 安装例子仅代表历史已发布版本，不会安装此次未发布适配。
- npm 物理材料与版本差异位于忽略的 `tmp/0.2.1rc5-to-0.2.2rc1/`；GitHub compare 返回被截断、匿名 API 限流，因此不声称完成整个版本区间的全量 commit/revert 审计。API 结论来自实际声明及实现，不仅来自提交说明。

## 七触点台账

| 触点 | 实际命中与处理 | 验证边界 |
| --- | --- | --- |
| patch / 配置 | 保留独立 bundle 行、默认禁用 Bridge 分类授权；Cordis 4.1 apply 配置使用解析后的值，不从 fiber.config 误读 Volatile 原始值 | 真实 Loader 与配置更新测试；未改日常 profile |
| 事件 / 生命周期 | Bridge turn 边界改由 owning AgentRegistry 的 `turnBoundaryOf(session).lastTurn` 读取；显式挂载异步 session projections | 定向 RED/GREEN、真实原生 loop 与卸载取消；不是 durable 恢复 |
| 服务 / Remote | Session Controller 组合补齐目标版本所需 `typertGateway`；保持公开 controller API 与默认审批。Bridge 保留 native MCP/RemoteAccess 生命周期 | Session Controller 真实组合、MCP stdio/HTTP 夹具 |
| 文件系统 | Bridge 继续仅定向读取授权 Home 元数据，拒绝凭据/状态文件与越界路径；不新增写入或秘密读取 | 既有安全回归继续运行；不宣称防止所有祖先目录 symlink 并发替换 |
| UI / 工具 | Session 引用预算新增必需模型路由；Bridge 工具执行改用真实 scoped batch executor 测试；Zoom 修复目标 anchored viewport 上限二次缩放 | 单元/Loader/原生 kernel/Chrome DOM 分层记录；不冒充产品 Web |
| 通道 | 不新增 channel；保留 sourced untrusted session reference、user-level Home 指令与 native subagent 消息归属 | schema snapshot、实际 prompt 与 scope 断言 |
| 子进程 | Bridge 保留显式授权 MCP/hooks 与卸载回收；不导入 Codex OAuth、不读取真实凭据、不启动替代 Web server | 测试所有进程使用人工夹具；真实服务商执行未验收 |

## Session Tools

`sessionReferenceResolver.prepare` 的第四参数不再是 signal，而是路由，取消信号为第五参数。`read_session` 在审批后读取当前 `session.requestHeader().config`；缺少当前请求时明确失败，不退回未来 `model.current()`。显式导出的可选 `injectMentionedSessionReferences` helper 要求调用方传入 `agent/pre-step` 捕获的 `modelSelection`。默认 bundle 仍复用 Host 原生 mention/reference，不挂载旧注入链。

测试把 `model.current()` 故意设置成不同的下一轮模型，断言传给 resolver 的正是当前请求/step 路由及原 AbortSignal。原生普通 fork 的测试按 `isSeeded` 与 `inheritedEventCount` 识别，并断言没有 subagent 专用的 `parentSession`。不修改 Host 日志格式、inclusive event cut 或审批模型。

证据：目标 typecheck 首先以两个 `AbortSignal` 不能赋给 route 的 TS2345 失败；路由断言先 RED 后 GREEN。真实 Controller 组合补齐 gateway 后暴露旧 fork 元数据断言，再按目标原生契约修正。最终包 typecheck 与 test 退出 0，41/41 通过，包含真实 Loader/Controller/AgentLoop；不是本轮日常 Web 验收。

## Codex Bridge

业务逻辑只将旧的 string-key projection 查询改为 `ctx.agents.turnBoundaryOf(agent.session).lastTurn`。测试组合显式安装 session projections 与 `dsh-tool-executor-native`，用 batch/callId 关联真实执行结果，不伪造 executor。撤销 MCP 授权时等待原 fiber 真正 drain，避免把移除配置行当成 teardown 已完成。

原生角色测试默认从本包显式、精确的 dev dependencies 解析 agent loop 与 in-process spawn。额外物理树会产生两份 `dsh-scope` 的 ScopeKey Symbol，导致 scope 断言失真；测试拒绝混实例。保留 `resolveChildAgentOptions` 唯一继承规则，不以 `model.current()` 改写父请求快照。完整父 turn 的 `model.select`、`requestHeader`、Home/role 实际 prompt、父工具 scope 拒绝、子深度与卸载取消均有断言。独立审查发现初版测试只观测父模型、自带角色模型覆盖且手工派发工具，不能证明父 step 路由继承与跨 Agent scope 隔离；已补不覆盖模型的角色、创建 route 与选中 route 不同的父 Agent，由真实父 loop 发起目录拒绝和 `codex_agent`，断言子请求沿用选中 provider/model、结果回到父继续完成。另一真实 Agent 在首个限制仍激活时通过独立完整 turn 成功调用目录，证明不串扰；不是以 agentless global 调用代替。

证据：目标初跑暴露 projection 依赖、`TOOL_EXECUTOR_UNAVAILABLE` 与旧投影类型错误；owning-handle 回归在旧实现失败。最终 typecheck、build、默认完整测试退出 0，84/84 通过、零 skip。测试使用脚本 LLM、人工 Home、真实 native kernel；不等同真实模型服务商、GUI 或 durable 会话恢复。

## UI Zoom

目标原生 `useAnchoredPosition` 从 visualViewport 写入 `--dsh-anchored-max-width/height` 与可选 min-width。原四边偏移校正不足以约束放大后的菜单。Chrome DOM RED 在 800×600、offset 20/40 的受控 visualViewport 下重现：100% 高度 576 正常，150% 为 864、300% 为 1728、115% 约 662，超出容量。

本轮校正仅作用于 fixed overlay 的严格 px 值，并校正 anchored 上限与 anchor min-width；相对长度不改。逐属性保存来源与写入值，避免 Host 只更新 top 时重复除 left；动态 zoom refresh 从原来源重算，卸载只恢复仍由插件持有的写入，不覆盖更新的外部写入。没有复制或替换 Host 的 side/align/clamp 算法。

### 已知几何边界

原生 hook 在使用 `offsetWidth/offsetHeight` 决定 end/top/clamp 时混合 CSS 与 rendered 坐标。非 100% 下的 end alignment、向上定位与边缘 clamp 未修复：最终 Chrome 记录中 150% end 的 panel.right 为 480.83、anchor.right 为 390；300% 默认 start 的 panel.right 为 847.64、宽面板为 1076，均超过模拟 viewport.right 820。上限修复只保证尺寸容量，不保证这些定位路径整体处于可视边界内。该风险不可无依据归为此次目标版本新引入，且没有可靠公共 DOM anchor/placement 关联供纯外部校正器重新定位；不猜 activeElement 或 monkeypatch Host。移动键盘/WebKit visual-origin、真实 pinch zoom、日常 Host 浮层仍须产品验收。

精确上游 hook/CSS 的 Chrome 测试使用受控 React effect/state adapter 和模拟 visualViewport，是真实浏览器 DOM 几何回归，但不是 React 产品挂载或 DSH Web E2E。上游来源、SHA 与 MIT notice 见包内 fixtures 说明。

## 验证状态与产物

- 旧 cohort 基线 `pnpm -r typecheck`、`pnpm -r build`、`pnpm -r test` 全部退出 0，日志位于 `tmp/dsh-0.2.2-baseline/`。
- 目标锁图递归枚举 94 个 `@deepseek-ai` 包，DSH 版本集合仅 `0.2.2-rc.1`、Cordis 仅 `4.1.0`，未加 overrides、file/link 或绕过 peer 的设置。完整图位于 `tmp/dsh-022-dependency-graph.json`。
- 目标全仓 `pnpm -r typecheck`、`pnpm -r build`、`pnpm -r test` 均退出 0；默认测试分别 41/41、84/84、67/67，总计 192 项通过、零 skip。日志为 `tmp/dsh-022-final-{typecheck,build,test}.log`。执行环境 Node `v26.0.0`；最低支持版本来自目标契约，不宣称本轮另跑过 Node 24.9。
- 最终 Chrome `156.0.8078.80` 测试退出 0，覆盖 50/100/115/150/300% sidebar、目标 hook 尺寸上限、宽面板压力、anchor min-width 与真实内部滚动（scrollTop 80），日志 `tmp/dsh-022-final-browser.log`；明确不把仅打印的 side/align 几何算作通过断言。已阅 150% fixture 整页及局部：footer 与滚动条可见；高菜单覆盖 anchor，不能据此称全面定位或产品视觉验收。Chrome 进程组及测试专用临时浏览器目录已清理。
- 三包 tarball 的 manifest exports、相对运行时导入、外部运行时依赖与 client inject 已审计通过；不会打包凭据、node_modules、tmp 或 `.pnpm-store`。开发浏览器脚本单独按 devDependencies 审查，不把 TypeScript 当运行时依赖。原始报告为 `tmp/dsh-022-packed-audit/report.json`。同步验证文档后的 Bridge 再打包仅改变文档；运行时 JS 指纹须与已验证产物一致。
- 三包 tarball 另以包管理器安装到忽略的临时 consumer 目录，均能导入 Host 入口且 peer 实际版本为 `0.2.2-rc.1`；日志为 `tmp/dsh-022-consumer-{install,import}.log`。这仍不是日常 DSH profile 激活或浏览器加载。临时完整公开运行时安装存在上游 OpenTelemetry 的 api 1.10.0 与 `<1.10.0` peer 警告，未用 overrides 或忽略策略掩盖；不将该入口探针描述成完整上游依赖无警告。
- 当前 GUI `http://127.0.0.1:56395` 的只读浏览器访问返回 401，已停止访问；没有提取认证信息或绕过，不启动另一个端口。仓库约定的 3080 日常 Web 验收未执行，不改日常 profile 或重启 Desktop。
- 真实 CLI Headless 产品入口探针已退出 0：DSH `0.2.2-rc.1`、Node `v26.0.0`，15 条外部 NDJSON 事件覆盖目录、原生角色委派、结果交付及父完成，人工 Home 保持不变。目标 `final` 事件新增 `sessionId` 与 `reason`，探针先因旧断言失败，再按实际协议修正。日志为 `tmp/dsh-022-headless-artifact-final.log`；被执行 Bridge tarball SHA-256 为 `46c1ed3c1359924d840e4f985f559d05a8e80409085d56cce8a2207b06f65ecc`。这是物理 tarball 加链接依赖的临时人工 Home 探针，不代表 package-manager profile 安装、日常 GUI 或真实 provider-backed E2E。
- 未发布 npm、未创建 tag/Release、未推送本轮适配；没有 Obsidian 记忆改动。

## 回滚

源码可回到上述已推送基线，重新安装该提交的锁文件 cohort；不将部分 rc.1/rc.5 包混用。本次未改日常宿主/profile，因此不存在声称已完成的宿主部署回滚。忽略目录中的包缓存、日志与临时测试 Home 不进入发布产物；保留原有未跟踪 `.pnpm-store/`。
