# Codex Home 设置页优化实施计划

> 执行方式：用户已确认视觉方案并授权本会话开发；按任务逐项实现、测试和审查，不自动提交、安装或发布。

**目标：** 将 Codex Home 插件设置页融入宿主设置视觉，明确导入、授权与诊断层级。

**架构：** 保留 settings.section、ConfigForms、createCommit 和 CatalogView 安全投影。React 页面以局部作用域样式使用宿主 --dsw-* 主题变量；客户端诊断增加明确状态，不改变 Host 目录或执行能力。

**技术：** 现有 React 18、TypeScript、Node test、tsdown；不新增运行时依赖。

**依据：** 本会话用户提供的两张截图与已确认的四分组方案；docs/design/codex-home-bridge.md 的当前原生鉴权与整类开关边界。

## 全局约束

- 页面分为桥接与目录、导入内容、执行授权、只读诊断；不修改宿主导航和弹窗。
- 保留七个整类布尔配置和一个 Home 路径，不新增单项开关；插件技能跟随 Plugins。
- MCP/Hooks 启用必须显式确认；不开启新认证流程，不读凭据，不展示 env、Header、命令或指令正文。
- 设置仅以 Host 确认值呈现；加载、不可写、保存中禁用编辑；拒绝与失败必须可见。
- 诊断区分 idle/loading/ready/failed；过期结果不覆盖新配置；卸载后不发布。
- 不自动重试、重连或安装，不改 DSH 核心、配置或依赖。
- 不将目录计数或配置开关包装成运行健康状态。

## 任务一：页面、文案与主题

文件：src/client/Page.tsx、src/client/locales.ts、新增 src/client/styles.ts；测试 tests/client.test.mjs 与独立页面行为测试。

接口：仍接收 PageProps 的 commit(field,value)、refresh()；消费 PageState.catalogStatus（idle/loading/ready/failed）和原有 config/pending/error/catalog。

- [x] 先添加失败测试：七个有可访问名称的整类 switch，四分组，loading/readonly/pending 禁用；目录不为空才提交；诊断失败与未读取不能显示为零。
- [x] 运行 `node --test tests/client.test.mjs`，确认新增断言在旧构建上因缺少功能失败。
- [x] 实现紧凑四分组设置行、统一 input/button/switch、辅助说明、内联错误和分层只读诊断。
- [x] 使用局部 CSS 作用域和主题变量；保留可见键盘焦点，长路径/长诊断换行，窄屏不裁剪。
- [x] 构建后运行页面测试，检查英文/中文、开关语义、空/失败/加载、危险能力授权文案。

## 任务二：诊断状态与生命周期

文件：src/client/store.ts、src/client/index.tsx、新增 src/client/catalog-reader.ts；新增 tests/client-catalog.test.mjs。

接口：PageState.catalogStatus；catalog reader 通过当前 config snapshot 身份判断结果是否仍有效，提供 refresh/invalidate/close；状态通过 store 发布。

- [x] 先写失败测试：读取时显示 loading，成功 ready，拒绝或异常 failed，重复刷新合并，配置变化丢弃旧结果，卸载后不发布。
- [x] 运行该测试并确认旧状态/读取实现不能满足断言。
- [x] 实现只读 reader 状态机并接入原生 ConfigForms 与插件 disposer；不传原始错误到页面。
- [x] 运行定向测试及既有 client-bundle 测试，确认旧提交、确认与隔离边界不变。

## 任务三：集成、视觉与交付

- [x] 使用包内现有 `build` 脚本构建；使用实际可用的 Node/pnpm，记录构建限制。
- [x] 运行 client、client-catalog、client-bundle 定向回归；沿用已有 Loader 组合核对发布入口，不运行无关 MCP/角色测试。
- [x] 尽可能通过正式 Page 组件的本地 fixture 渲染浅色、深色、窄屏与失败场景。fixture 不读取真实 Home 或凭据，不替代真实产品 E2E。
- [x] 日常 profile 未安装或覆盖；真实已安装 GUI 验收保留为需用户另行授权的后续动作。
- [x] 对最终 diff 做对抗式与安全自查：权限、确认、持久化、秘密、安全输出、过期请求、资源清理、键盘与响应式。
- [x] 在本设计记录中补充实际验证结果及缺口，README 只更新已交付的页面能力。不提交或发布。

## 实际交付与证据（2026-10-24）

- 四组布局、右侧整类开关、目录显式保存/Enter、字段校验、保存与拒绝/失败提示、只读与处理中禁用、诊断快照与折叠详情已实现。全局指令/技能/插件/Agent/MCP/Hooks 的 Host 行为和独立确认没有变更。
- 诊断 reader 明确区分 idle/loading/ready/failed，合并同代刷新，并丢弃配置失效和卸载后的晚到结果。首次扫描等待 Host 设置 ready，避免加载时过早扫描被设置到达立即作废；后续设置变化不自动重试，用户显式刷新。
- 先在旧构建观察页面测试 6 项预期失败；新的诊断入口测试也观察到缺少 loading/failed 状态，以及首次设置 loading 时过早读取的失败。正常字段帮助与错误描述不混用的无障碍回归同样先失败后通过。
- 最终 `pnpm run build` 成功；`node --test tests/client.test.mjs tests/client-page.test.mjs tests/client-catalog.test.mjs tests/client-entry.test.mjs tests/client-bundle.test.mjs tests/client-loader.test.mjs` 共 **22 项全部通过，无跳过**。测试通过已构建 lib；client-loader 经实际 Cordis Loader 读取临时 cordis.yml、加载浏览器命名入口、使用真实 store/Page/reader 渲染并回放已审阅的中文 HTML 快照，验证卸载释放设置订阅。Host transport/settings/outlet 是 fixture，不是正式 UI 运行环境。
- `node scripts/verify-settings-browser.mjs` 使用系统 Chrome、私有临时用户目录与 CDP pipe，无网络服务和日常配置安装；直接消费发布形式的 lib/client.js wrapper、真实 React 与 store，只替换 Host 服务和槽出口。通过 **9 组浏览器检查**：浅色布局，授权取消/接受，Host 拒绝与失败，保存中禁用，空白目录与有效显式保存，只读和诊断加载/失败，深色开关对比，真实 360px 长内容不溢出且 HTML 保持文本，Space 操作与焦点环。
- 浏览器检查曾真实复现旧深色轨道/圆点近白对比不足，已改用宿主确认存在的 label-primary 与 bg-layer-2 变量。fixture 最初缺少 viewport meta 导致移动端按 980px 布局，已补 viewport 并断言 innerWidth=360，最终截图为 360px，而非缩小桌面截图。
- 最终浏览器证据目录：`/var/folders/jd/vjf89lqs25n38gnns2tcxq180000gn/T/codex-settings-browser-h5eUnm/`，包含 preview.html、light/dark/failed/narrow.png 与 report.json；该目录属于本机临时证据，脚本可重新生成。已实际查看浅色/深色/窄屏截图，模拟布局与正式组件按相同源实现，明确标记 fixture。
- 使用依赖工具返回的 Node 24.21.0 启动 pnpm 和定向测试；pnpm 脚本及浏览器 helper 沿用机器 PATH 中 Node 25.9.0。没有变更运行时配置或安装依赖。
- 真实 GUI 边界：当前会话未运行 dev:web watcher；本地构建不代表日常安装已经更新。Pencil browser 绑定未连接应用，未借此声称访问或验收当前 GUI；也未通过访问凭据绕过登录。日常 profile 安装、正式设置持久化和真实弹窗确认仍需安装后验收。本轮未提交、打包发布、安装或部署，未重跑无关 MCP/模型测试。
- 对抗式与安全自查：保留 createCommit、MCP/Hooks 独立确认与只读安全投影；JSX 输出转义；不新增凭据读取/外部请求/秘密日志；过期数据不会伪装当前诊断。CSS 限于页面作用域，不覆盖宿主全局；正常字段帮助与 aria-errormessage 分离，invalid 状态随用户修正清理。新增 browser fixture 仅使用模拟路径和条目。

## 日常 Desktop 安装（2026-10-24，用户追加授权）

用户授权安装并明确由自己重启 GUI。日常目标确认是 `/Users/suqing/.dsh/profiles/desktop`，不是另建 Web profile。保留插件版本 `0.1.1`，生成独立本地产物 `packages/dsh-codex-bridge/suqingsq-dsh-codex-bridge-0.1.1-settings-20261024.tgz`，未覆盖旧 tarball；SHA-256 为 `d520e387fdad98fd9cb323cdd7d90bb03ca4d58055a8d672a078e0d1e9d11208`。

- 安装前备份 profile 的 package.json、pnpm-lock.yaml、cordis.patch.yml 及旧插件到 `/Users/suqing/coding/plugin/dsh-plugins/tmp/codex-home-install-backup-20261024-2330/`；配置副本和回执使用私有权限。
- pnpm pack 的 prepack 只构建，不重复运行开发阶段已通过的测试。使用 profile 既有 pnpm，离线更新唯一目标依赖，再以 `--offline --frozen-lockfile --ignore-scripts` 安装；没有执行依赖生命周期脚本、网络下载、发布或 GUI 重启。
- 安装后 **84 个文件逐个与 tarball 解包内容一致**，客户端入口 SHA-256 为 `71261da3ef4cbe3692a91e4aaec1c511391b7fdde80cc6d7a5982764a7c6c34a`，与源构建一致且不同于旧安装。
- profile manifest 仅该插件 tarball 路径变化；除相应路径和完整性字段外，其余锁记录结构完全不变，bundles 与 cordis.patch.yml 字节不变。各直接依赖的实际版本均与既有安装保持一致。
- pnpm 报告 peer dependency 提示；完整锁记录比较没有发现本次引入的依赖变更，不把此提示隐藏为“无警告”。未为该提示扩大范围或修改依赖。
- 安装时回执为备份目录下的 installed.json；文件一致不代表运行中的 Host 或页面已加载新产物。用户随后反馈「没问题，可以的」并授权清理备份、提交交付；未据此扩展为自动化真实 GUI E2E 结论。
- 2026-10-24 收尾时，按用户明确要求删除了上述本次备份目录（含旧插件副本、解包副本及回执），保留本节的安装指纹记录；确认 Desktop profile 引用的独立 tarball 位于备份目录外并仍然存在。其他任务的备份没有删除。
- 本次提交收尾按约定不重复执行测试，复用本轮开发阶段已有的 22 项定向测试、9 组 Chrome fixture 检查和安装文件核对证据；不将其扩大为平台全套 CI 或正式 GUI 自动化验收。
