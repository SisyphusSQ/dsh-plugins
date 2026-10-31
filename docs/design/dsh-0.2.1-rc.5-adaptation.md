# DSH 0.2.1-rc.5 契约适配与验收记录

## 目标和授权

2026-10-31，用户授权修复本轮只读审查发现的全部契约问题，完成测试及验收；通过后全量提交并推送当前分支，再更新本机插件。不创建 PR、tag、GitHub Release，不发布 npm，不升级 DSH 宿主。

- 源码起点：`main@f3ae9f88210cf876ec0312acd95a446a7b8b9f37`。
- 起始开发依赖：DSH `0.2.1-rc.2`；目标：本机 Desktop 的 `0.2.1-rc.5`。
- 宿主源码以精确版本实际实现为准；ASAR 裁剪的 `.d.ts` 不当作已验证类型证据。
- 基线：修改前 `pnpm -r typecheck && pnpm -r test` 退出码 0。各包结果以本轮工具原始输出为准；其中 ui-zoom 50/50、codex-bridge 74 pass / 1 opt-in skip。该基线未覆盖原生角色 opt-in，也不等价于 GUI 验收。
- 起始未跟踪设计稿 `dsh-composer-predictions.md` 依用户“全量提交”约定纳入，但不据此实施自研预测功能。

## 实施计划与边界

1. Worktree：Host 模型工具与命令使用调用会话的有效工作目录及文件/子进程沙箱；保留独立 CLI 能力、new/existing/detached 模式、取消与资源释放；Workspace 复用按稳定身份而非显示标题导航。
2. Session tools：默认创建目录来自宿主 workingDirectory；采纳宿主原生 `atSeq` 精确 inclusive 截断语义，同步工具、审批和文档；由宿主原生 reference 提供 `@session` 候选与提及注入，避免重复提供者。
3. Codex Bridge：同一次委派读取一次宿主 `resolveMaxDepth`，同时用于预检和 activation request；保留取消、撤销和卸载语义。
4. 缩放：初审未发现明确接口破坏，不作猜测性改写。真实 Web 对照非默认 zoom 验收时发现连续操作丢失：10 次真实 DOM 点击，style 出现 100→105→110→115→105（旧回灌）等回退，最终 120/130 而非 150。rc.5 ConfigForms 虽序列化写入，但较早 `settings/document-updated` 触发的 describe 可在新 write pending 时独立发布旧值；随后用精确发布 bundle 与可控 remote 时序建立 RED；修复只在最新本地 write pending 期间保护意图，原生 set Promise<boolean> settle 后收敛到 Host/最近确认值，拒绝或断线显示失败。57/57、类型检查/构建通过，未改几何、未禁用快速调节、未增加重试；后续新产物真实 Web 连续十次调节、刷新持久化与 150% 浮层验收也已通过。
5. 四包开发依赖和 hook-protocol 对齐 rc.5；最终版本为 session-tools 0.3.3、worktree-workspaces 0.4.0、codex-bridge 0.1.2、ui-zoom 0.1.7（真实 Web 验收再现连续点击旧设置回灌覆盖新意图，故不复用已验收安装的 0.1.6 坐标）。Worktree 原拟 0.3.2，独立审查确认 `./client` 的 `worktreeOptions` / `waitForWorkspace` 是真实公开 API，改接 Host 稳定身份数据是破坏性变更，故提升 0.x minor 并给出迁移说明，不添加旧标题降级。
6. 各修复先记录针对性 RED，再实现 GREEN；Lead 审阅完整差异，执行整套类型/构建/测试与目标宿主验收，明确区分 fixture、原生组合和真实 GUI。
7. 验收通过后进入提交收尾，不重复测试；依用户技能全量暂存、敏感信息审查、普通提交并推送 `origin/main`。
8. 本机插件更新先备份 profile，使用官方 Desktop CLI 安装本地 tarball，回读版本和产物。重启当前 Desktop 会中断会话，不在会话内直接执行；安装状态与运行态生效分别报告。

## 版本依据

- [精确上游差异 rc.2…rc.5](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-rc.2...dsh-v0.2.1-rc.5)。GitHub compare 的文件列表有截断，审查另比对两 tag 完整、未截断的 tree blob ID。
- 本轮发现的沙箱、有效目录、分叉语义、Workspace 标题及子代理深度问题均在 rc.2 基线已存在，不归因为 rc.5 新回归。
- rc.3 的空白会话复用变化、rc.5 的推理 `text/rawText` 变化已按实际调用面核对；现有插件未使用推理 body 插槽。

## 验收记录

本轮四包声明范围内的功能、产物和指定产品流程验收已通过。依赖安全扫描未通过，保留宿主归属的已知告警，详见下节；两者不混为一个“全绿”。分层证据：

- Bridge tarball 额外通过真实 rc.5 CLI/Headless 产品入口的完整父任务 → catalog tool → 原生角色子任务 → 父任务回复流程；Node v24.21.0、15 条 NDJSON、脚本模型、fixture Home 字节不变。产物 SHA-256 `6347e36649010f3d2ab67e67e30a1be3b0bd8b819a36dffc6b8a3a95ff1d5a67`。该测试消费物理化的应用公开 runtime 与 tarball，依赖以精确 cohort 链接，不是包管理器安装、持久后端或真实服务商 E2E。原探针的固定旧版本/缺 workingDirectory 组合已按当前公开契约修正；ASAR 虚拟目录不能替代物理 runtime 的边界现有明确拒绝信息。
- Bridge 修复先取得 7 项 unit RED 与 Loader cap=0 的有效 RED，再完成 83/83 测试且 0 skip；其中精确 rc.5 Agent loop/spawn 使用真实 ASAR 实现和脚本模型，覆盖深度拒绝、合法启动及卸载取消。独立类型检查退出码 0。
- Worktree 32/32、类型检查/构建通过；真实 LocalFs/Subprocess/Sandbox provider 覆盖只读和 workspace-write 越界拒绝（无目录/分支残留）、workspace-write 根内三种模式成功、danger-full-access 的有效目录、policy 原样透传、取消后 PID 不存在及 4 MiB 输出限制。另由 bundled Node 24.21.0 直接运行编译后的 Host/receipt/CLI 用例，12/12 通过。尚未覆盖 Windows/Linux。
- 全仓目标类型检查、构建和套件初次全绿（zoom 50、bridge 83、session 35、worktree 32；0 skip）。随后独立审查发现公开 factory 参数新增必需服务破坏兼容，回到开发修复：显式 service 可省略，只从已经认证的 caller Context 解析原生 workingDirectory，缺失时受控报错，不回退 header/process cwd。真实 TypeScript consumer 编译先取得 TS2741/TS2345 RED，再编译成功；Session 最终完整构建/类型检查及 40/40 通过，不以旧全绿掩盖审查发现。
- 目标依赖安装退出码 0；四包 DSH cohort 与 hook-protocol 为 rc.5，Cordis include/group peer 错配已纠正。
- ui-zoom `build && test:browser` 退出码 0；Chrome 156.0.8078.74，50/100/115/150/300% 初始及动态切换、文档/内部滚动全部通过。该 fixture 不是 DSH 产品 E2E。
- 日常 web profile 通过官方 Desktop CLI 安装四个最终 tarball，真实 rc.5 CLI/3080 冷启动；使用本轮启动 URL 的正规 token 交换认证，未读取或伪造凭据。新旧产物基线页面均 HTTP 200；最终四包 Host 入口和 client 字节逐一匹配审计产物，实际服务的 JS 包含 0.1.7 的新实现，启动异常/禁用/等待诊断、浏览器 exception/console.error 均为零。
- 真正的 General 设置行通过原生 Host 保存及刷新回读；Codex Home 设置页正常挂载，未改变其导入/执行授权。原生 `@` 弹层只有 reference 来源、三项唯一候选，选择生成 `data-composer-chip=reference` / Lexical decorator，而非普通文本；未提交模型请求。
- 真正 `/worktree` 选择器调用 Host status，列出正确 canonical 本地路径与新建项。未在用户真实仓库创建工作树；创建、三种模式、拒绝/取消/清理和稳定回执以原生 provider 回归、公开业务 API 和源码契约核对覆盖，不称为真实 Web 创建/复用端到端证明。
- 0.1.7 在同一真实 Web 连续点击十次得到 150%，等实际写入响应后刷新仍为 150%；150% 下原生 Tooltip 与账号菜单均在视口内，未出现二次缩放偏移。结束恢复 100%。最终视口/文档均 1440×1000、scrollWidth/scrollHeight 无额外溢出、补偿表 owner 恰为 1。0.1.6 的失败实证未被略去。
- 最终开发回归合计 212 项通过（session 40、worktree 32、bridge 83、zoom 57）。三个独立只读审查门均已通过；发现的公开 API 问题分别通过兼容修复和明确 0.x minor 迁移处理。未验证 Windows/Linux、真实供应商回合或最终安装后的 Electron 冷启动。
- 测试产物和 web/desktop profile 非凭据备份位于本机 `sqmc04` 的 `/tmp/dsh-plugins-rc5-uromr1`，不纳入 Git。
- macOS bundled Node 强制置于 PATH 首位会使第三方 rolldown native addon 被 Library Validation 拒绝；未更改签名/系统安全设置。以 bundled Node 运行指定 pnpm，同时保留原 PATH，脚本子进程使用已安装的 Homebrew Node 25.9.0，是本轮基线/构建采用的运行环境。

## 最终产物与本机更新

| 包 | 版本 | tarball SHA-256 |
| --- | --- | --- |
| session-tools | 0.3.3 | `8cdf12ae182a118ebacea0d2c12bd0a9150025cf58b7d573cb96551b403e9286` |
| worktree-workspaces | 0.4.0 | `2bf003c6036f853cc65f13117d947137fd5d0d882912be8f2d4163bd29317256` |
| codex-bridge | 0.1.2 | `6347e36649010f3d2ab67e67e30a1be3b0bd8b819a36dffc6b8a3a95ff1d5a67` |
| ui-zoom | 0.1.7 | `f8839cc910f357a3df4a73f39b2f1b633f41fd5f9bbac31fad3d05b9c5ddde1b` |

内容审计检查包名/版本/入口、相对运行时导入、秘密路径、tar 条目/链接、文件数与大小界限，以及 client 与已构建产物字节一致性。缩放包原有 `files` 白名单明确包含源码、复现脚本和单个浏览器 fixture，保留其可复现性，不将显式交付的源码误判为泄露。

本机 `sqmc04` 的持久 profile 回滚备份：[dsh-plugins-rc5-pGkQzX](</Users/suqing/.dsh/profile-backups/dsh-plugins-rc5-pGkQzX>)。仅含两 profile 的依赖、锁文件、workspace 与 patch，不含凭据。web 安装因离线供应链缓存拒绝新 hook-protocol 坐标，已将原有发行时间例外从精确 rc.2 替换为已审阅的精确 rc.5，再通过官方安装器成功；未关闭全局策略。profile peer 警告来自由应用 runtime 提供的包；已有 use-sync-external-store 缓存 metadata 缺 `time` 的安装器警告未伪称已消除。

此文在提交前完成：desktop 按用户要求在提交推送后更新，最终安装回执另存上述本机备份目录，不为回写回执再制造第二次源码提交。不会在正在运行的 Desktop 会话内强制重启；安装和运行态一致生效须分别报告。web 测试引起的 welcome/zoom 行在结束后恢复原 patch，不回滚已安装的新插件。

## 依赖安全扫描边界

`pnpm audit --prod --json` 退出码 **1**：9 条 advisory（5 high / 4 moderate），不能表述为安全审计通过。路径全部经 `dsh-hook-protocol` 的 `dsh-session` / `dsh-shell` **宿主 peer** 到达目标 DSH 的 `zod@4.4.3` 与 `undici@8.11.2`；在实际 Desktop ASAR 也逐一回读确认这两个相同版本，非本轮新增的独立插件运行依赖。

- Zod：[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)，修补版本 ≥4.6.6。
- undici 的 8 条 advisory 均建议 ≥8.12.2：`4qv8-2p9j-2685`、`f72v-6w45-q472`、`xjj6-f33q-929c`、`4w7w-5xrc-9h26`、`2m5v-pch6-74hx`、`qrxm-fqhp-jwvm`、`9fm3-97px-rjf6`、`55wc-3pg8-jfw6`（均为 GitHub GHSA ID）。
- 目标 `dsh-http-proxy@0.2.1-rc.5` 精确锁定 undici 8.11.2。插件层擅加 override 无法修补应用 ASAR，只会偏离精确宿主组合并制造重复运行世界；本轮不升级宿主、不伪称关闭这些告警。是否触达各利用条件及宿主修补需人工安全评审。
- 本轮适配验收仅涵盖声明的插件行为与新增差异，不是整机或目标 DSH 的安全合规认证。

## 回滚边界

源码以起始 SHA 和本次提交为界；不自动覆盖全仓已有修改。profile 回滚以本轮记录的四包安装声明、锁文件及组合层备份为依据，仅恢复本轮负责的路径，保留其他插件与用户配置。
