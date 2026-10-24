# dsh-ui-zoom 设计文档

## 1. 状态

已交付：插件包本体（host + client 双半边）、设置页行、profile config 长期默认值、单元与注册契约测试，以及真实桌面 profile 的冷启动与缩放验收（见第 4 节）。首版曾尝试键盘快捷键，但在桌面端实测不触发，已按用户决定移除；设置行是唯一交互入口。

2026-10-17：仓库源码迁移到 DSH `0.2.1-rc.2`（当时桌面宿主），台账见 [dsh-0.2.1-migration.md](dsh-0.2.1-migration.md)。

2026-10-24：修复 Better Sidebar 嵌套视口层漏补偿导致的整页滚动增长，以及恢复 100%/卸载后启动样式残留。本机 `sqmc04` 的实际 Desktop 已是 `0.2.1-rc.3`；本轮没有顺带迁移开发依赖，具体证据与生效边界见第 4 节。

## 2. 兼容边界

- 编译与包测试基线：`@deepseek-ai/dsh@0.2.1-rc.2`；`engines.dsh` 为 `>=0.2.0-rc.2 <0.3.0`，同时覆盖 `0.2.0-rc.2`。
- DSH peer 声明为 `^0.2.0-rc.1 || ^0.2.1-rc.2`，devDependencies 精确钉 `0.2.1-rc.2`；`@deepseek-ai/cordis` 为 `~4.0.5`。
- peer 范围选型依据：0.2 宿主内置的兼容门禁使用 `semver.satisfies(runtime, range, { includePrerelease: true })`。`^0.2.0-rc.1` 在 0.2.1-rc.2 上仍被接受（下限 `0.2.0-rc.1`、上限 `<0.3.0-0`）；联合范围同时满足 pnpm 默认 semver（无 includePrerelease）对 exact `0.2.1-rc.2` 开发依赖的 peer 校验。
- 0.2.1-alpha.4 起若声明 `engines.dsh` 则只按它判定；未声明时逐包检查 `@deepseek-ai/dsh*` peer。本包两者同时保留：旧宿主（0.2.0-rc.2）只读 peer。
- 依赖的 DSH 包：`dsh-client-store`、`dsh-client-locale`、`dsh-client-ui-renderer`、`dsh-client-ui-settings`、`dsh-client-ui-settings-general`、`dsh-client-ui-slots`、`dsh-host-webserver`、`dsh-settings`。

## 3. 架构

插件是**双半边**结构，两侧各承担一半职责。

**Host 半边**（`src/index.ts`）

- 声明 `Config`，字段 `zoomPercent` 带 `.volatile()`，因此是响应式 getter，并由 `ctx.settings.configure({ auto: false }, ctx.fiber)` 绑定到 Host 用户设置文档 —— 一次拿到 profile 级持久化与设置页可编辑性。
- 通过 `ctx.on('webserver/index-inject', …, { prepend: true })` 推入一条 `{ kind: 'style', text: bootZoomStyle(...) }`，包含根 zoom、视口补偿和唯一注释标记 `/* dsh-ui-zoom */`，在任何浏览器插件启动前生效。

**Client 半边**（`src/client/index.tsx`）

- 在文档元素上写入内联 `zoom`，用 `ctx.effect` 绑定生命周期，插件卸载时 `removeProperty` 回收。
- 根据唯一注释标记接管 Host 启动样式表，而不是再叠一张表；将同一节点移到宿主样式之后以保留级联优先级，动态替换全部规则，并在卸载时移除。启动 150% 后恢复 100% 不会重新激活旧的 `body` 高度限制。
- `body > [data-dsh-better-sidebar] > [data-dsh-panel-host]` 显式按倍数校正高度，避免它的 `100vh` 在缩放后触发几何降级循环。此选择器是 Better Sidebar `0.28.0` 的 DOM 兼容面，升级该插件时需重新验证。
- 不注册任何键盘命令：桌面端实测 `Mod+=` / `Mod+-` / `Mod+0` 不能稳定触发；浏览器又把这些组合占用为原生页面缩放，声明默认值既抢键也无意义。设置行是唯一交互入口。
- 注册 `settings.general.item` 行（`id: ui-zoom`，`order: 12`），排在自带「外观」(10) 与「字号大小」(11) 之后。

**纯逻辑抽离**（`src/zoom.ts`）：夹取、步进、百分比到 CSS 值的换算、启动样式字符串构造，全部是不依赖 DOM 的纯函数，因此缩放策略可以脱离 jsdom 单测。

### 数据流

```
设置行
      ↓ commit()
  夹取 → 写内联 style → store.sync → host.set(zoomPercent)
                                        ↓
                            Host 设置文档（profile 级持久化）
                                        ↓
                            下次启动由 Host 注入 :root{zoom:N}
```

`adopt()` 只读取设置文档回灌的权威值、绝不回写，写路径只有 `commit()`。

## 4. 验证记录

| 项 | 结果 |
|---|---|
| `tsc` 类型检查 | 通过（0 错误） |
| `tsdown` 客户端打包 + loader 包装 | 通过，产物为 `window.__ModuleLoader__.load({ id: "@suqingsq/dsh-ui-zoom", factory })` |
| `npm pack` 内容审计 | 40 个文件，含 `lib/client.js`、`cordis.patch.yml`、`src/` |
| 单测 | 43 个通过（缩放策略 12 + 补偿规则 10 + 坐标校正 6 + 宿主注册 6 + 注册契约 5 + 设置行渲染 4） |
| peer 兼容性预测 | 8 个包全部被 `0.2.0-rc.2` 接受 |
| 视口补偿的隔离验证 | 通过，见下方「视口单位补偿」的实测表 |
| 真实桌面 profile 冷启动（8/8 加载） | 通过：渲染进程启动图 URL 列出全部 8 个 `@suqingsq` client bundle，无 `disabling profile plugin row` |
| 真实桌面 profile 缩放验收 | 通过：用户确认底部账号菜单恢复正确位置；加固前的错位见下方实测表 |
| DSH `0.2.1-rc.2` 迁移（2026-10-17） | typecheck/构建/单测通过；真实 `dsh web` profile 加载记录见 [dsh-0.2.1-migration.md](dsh-0.2.1-migration.md) |

### 2026-10-24：整页滚动与样式生命周期修复

适用机器：`sqmc04`。实际 Desktop 为 `0.2.1-rc.3`，修复前安装副本为 `dsh-ui-zoom@0.1.4`、`dsh-better-sidebar@0.28.0`，默认缩放 115%。编译依赖仍固定 `0.2.1-rc.2`；本轮不是全量宿主迁移。用户确认后已打包并本地安装 `0.1.5`；npm 未发布。

问题链路：Better Sidebar 的视口层位于 `body > [data-dsh-better-sidebar] > [data-dsh-panel-host]`，原 `body > *` 补偿漏掉它；其 `100vh` 在 115% 下渲染为 1035px（视口 900px），触发绝对定位 + RAF 平移降级，浮层随滚动持续撑长文档。另有独立缺陷：Host 启动样式与 client 实时样式叠存，恢复 100% 时实时表不再含补偿规则，旧表的高度限制重新生效。修复分别补齐嵌套层高度、接管并释放同一张启动表；没有增加根元素 `overflow:hidden` 掩盖溢出，也未修改侧栏插件或 DSH 核心。

| 验证层 | 结果与边界 |
|---|---|
| 失败回归 | 修改实现前，嵌套浮层、启动表接管、设置行重置、外部设置重置、卸载清理共 5 项单测失败；旧构建在真实 Chrome 布局回归中有 48 项失败 |
| 单测 | 50 项通过，新增真实 CSSOM 样式残留/接管/卸载/重新激活检查及宿主样式级联顺序用例；jsdom 结果不作为真实几何证明 |
| 静态与构建 | 类型检查、构建、构建后 client loader 语法检查通过；未新增依赖或改动锁文件 |
| 真实 Chrome 布局 | Chrome `155.0.8059.85`、视口 1280×900，消费构建后的 `lib/zoom.js`；50/100/115/150/300% 初始与动态切换通过；主 frame 与 panel host 均为 1280×900，`scrollHeight=clientHeight=900`，12 轮整页滚动位移 0，`degraded=false` 且 `syncFrames=0` |
| 内部滚动 | 主内容与侧栏程序滚动均为 80→160→240→320；真实 CDP 滚轮在五档均能继续滚动，没有靠禁用内部滚动消除症状 |
| 根元素候选 | 当前 fixture 的 `html,body,#root{height:100%}` 与未隐藏的根 overflow 没有产生独立根高度溢出；不把历史 `100vh` 外壳探针当作当前根布局的证明 |
| 当前真实宿主 | 使用现有 `http://127.0.0.1:50065` 与 Chrome `155.0.8059.85`；仅测试客户端的 HTML 启动样式和包含 zoom 的真实插件 combo 分别精确替换 1 次，其余框架/Better Sidebar 保持原代码。115→50→100→150→300→100% 均为 1280×900，16 轮整页滚动位移 0，降级标志为 false，样式 owner/marker 各 1，页面 exception/console.error/拦截错误均 0 |
| 当前宿主的验证边界 | 插件执行真实 `apply` 与 `commit`，但 ConfigForm 写边界被替换为浏览器内存表（共 5 次写入）；真实 Host 设置始终 115，未验证持久化，也未验证用户 Electron 窗口或安装后的冷启动；临时 Chrome 与用户目录均已清理 |
| 本地安装 | `pnpm pack` 得到 `0.1.5`、50 个文件；tarball manifest、相对运行时导入、client loader、浏览器回归 fixture 与脚本均已审计。当前 Desktop 依赖和锁文件已指向新 tarball，使用 `--offline --ignore-scripts` 安装；其余依赖锁定与 bundle 列表不变，`cordis.patch.yml` SHA-256 不变 |
| 产物身份 | tarball SHA-256：`3f01b3bb79f8c63217d979f577b536b01132de282aad1727a8aebd9e4128935e`；已安装 client SHA-256：`a3a3afbd042d95dd1b66e75ebc9b41d7a806196d45e93f5aac7afc6e6472d90a`，与完成真实宿主验证的构建产物一致 |

复用入口（先构建）：`pnpm --filter @suqingsq/dsh-ui-zoom test:browser`。脚本使用已安装 Chrome/Chromium，可设置 `CHROME_BIN`；创建独立临时浏览器用户目录，不启动 DSH 服务，结束时关闭自有进程组并删除经路径核对的临时目录。这是浏览器布局 fixture，不是完整 DSH Web/Desktop E2E，也不验证设置的服务端持久化。

本轮已按用户确认完成本地 `0.1.5` 安装。Desktop 对 client combo 有启动缓存，安装阶段未自动重启，以免中断当前会话；当时已告知需完整退出并重新打开，验收连续整页滚动、150%/100%/115% 切换、内部滚动与设置保存。

2026-10-24 安装后，用户反馈「我觉得没啥问题了」，接受本次修复并要求提交、推送及交付当前分支。此为用户验收反馈，不等同于代理独立重做 Electron 冷启动或逐项验收。提交收尾复用上述既有验证证据，按约定未重复执行测试；不打 tag、不发布 npm。

回滚基线保存在仓库忽略且权限为 0700 的 `tmp/zoom-install-backup-20261024-2206/`：含原 profile 依赖清单、锁文件、配置补丁、完整 `0.1.4` 插件副本、基线哈希及安装回执。旧 `0.1.4` tarball 仍保留。需要回退时先确认后续是否有其他 profile 变更，仅恢复本包的旧 tarball 引用并用同一 pnpm 重算锁/安装；不要整份覆盖后来新增的配置或依赖。

### 视口单位补偿（2026-10-06 实测）

CSS `zoom` 会乘算**绝对长度**，视口单位就是绝对长度：缩放子树里的 `100vh` 盒子先按视口高布局、再被渲染成 `倍数 ×` 高。用 Chromium 探针实测（视口 720px）：

| 场景 | 外壳渲染高度 | 底部头像位置 | 在窗口内 |
|---|---|---|---|
| 100% 基线 | 720 | 706 | 是 |
| 115%，未加补偿 | **828** | **812** | **否** |
| 115%，加补偿 | 720 | 704 | 是 |
| 150%，加补偿 | 720 | 699 | 是 |

这正是用户报告的「点个人主页时菜单错位」：外壳比窗口高 108px（0.15 × 720），把底部吸附的账号启动器与它上方的浮层一起推出窗口。

另一处独立缺陷来自坐标混用：`getBoundingClientRect()` 返回**已渲染**坐标，而 `window.innerHeight` 是**未缩放**的视口高度；把两者相减写进 `position: fixed` 的内联偏移后，偏移还会被再乘一次倍数。DSH 的 `AccountNoticeCard` 正是这种写法（`bottom: Math.max(8, window.innerHeight - rect.top + 4)`），实测 115% 下与锚点的间距从 4px 漂到 15px。

## 5. 被否决的方案

- **改根字号（`html { font-size }`）**：设计令牌全是 px（实测 422 个 `--dsw-*` + 67 个 `--dsh-*`，`rem` 出现 0 次），根字号对任何东西都不生效。
- **改写令牌**：除字体阶梯与圆角外没有 spacing/size 令牌，且约 5000 处字面 px 直接绕过令牌，改写令牌无法达成整体缩放。
- **`transform: scale`**：会为 fixed 后代新建包含块，且漏掉挂在 `body` 上的 portal，菜单/弹窗/toast 的尺寸与位置都会错。
- **动 Electron `app.asar`**：破坏签名，且每次应用更新被覆盖。
- **走 `webContents.setZoomLevel`**：桌面壳 preload 只暴露 `{keyboard, shortcuts}`，渲染层拿不到 Electron 能力；这属于宿主改造，不属于插件。
- **自造 localStorage 持久化**：DSH 0.2 自带的设置文档机制同时解决持久化与设置页编辑，无需重复实现。

## 6. 已知限制

- 整体 zoom 与「字号大小」相乘，不是替代关系，文档与设置行描述都已写明。
- 画布类内容不等比：pdf.js 与 Luckysheet 按 `devicePixelRatio` 决定背板尺寸，CSS `zoom` 不改变 dPR；xterm 有自己独立的缩放因子。
- **本轮加固的两类错乱已修**：视口单位相乘导致的溢出（注入样式把外壳尺寸除以倍数）与 rect 定位浮层的二次缩放（`MutationObserver` 把内联偏移除以倍数）。
- **加固不是全覆盖**。DSH 里用 `calc(100vh - N)`、`calc(100dvh - N)` 之类算式自行计算的浮层不受外壳补偿影响，仍可能在非 1.0 倍数下偏；图片灯箱等即属此类。
- **没有任何页面缩放 API 可用**。Chromium 的**页面缩放**缩放的是 CSS 像素本身，`100vh` 与 rect 都不会错位；但 DSH 二进制产物中 `zoomFactor` / `setZoomLevel` / 缩放菜单项出现次数均为 0，preload 也未暴露。CSS `zoom` 是插件唯一可用的机制，因此这类冲突只能逐个补偿，无法根治。
- 非 1.0 倍数会触发整页重排，滚动位置可能跳动。
- 缩放只作用于 Web 内容，操作系统绘制的窗口控件（macOS 红绿灯）不会跟随。

## 7. 升级流程

DSH 版本线仍处于 developer preview。升级到新的 DSH 版本时：

1. 用目标版本内置的 semver 复核所有 `@deepseek-ai/dsh*` peer 与 `engines.dsh` 是否仍然被接受 —— 这是安装期与启动期的硬门禁。
2. 复核 `settings.general.item` 槽位声明与 `PropsRuntime`/`PropsStore`/`PropsLocale` 的派生契约。
3. 复核 `webserver/index-inject` 的注入形状（`kind: 'style'`）仍然有效。
4. 重新执行真实 profile 冷启动 E2E，并在本文件第 4 节更新记录。
