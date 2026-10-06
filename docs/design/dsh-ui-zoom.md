# dsh-ui-zoom 设计文档

## 1. 状态

已交付：插件包本体（host + client 双半边）、快捷键命令、设置页行、profile config 长期默认值、单元与注册契约测试。

未完成：**真实 DSH 桌面 profile 的冷启动 E2E 尚未执行**。当前所有绿灯均来自类型检查、构建、打包审计和 jsdom 测试，按仓库约定这**不等于**真实 Web/桌面 E2E。

## 2. 兼容边界

- 目标版本：`@deepseek-ai/dsh@0.2.0-rc.2`（与目标机桌面版一致）。
- DSH peer 声明为 `^0.2.0-rc.1`，devDependencies 精确钉 `0.2.0-rc.2`；`@deepseek-ai/cordis` 为 `~4.0.4`。
- peer 范围选型依据：升级卡 `DSH-0.2.0-RC1-01` 实测表明，`^0.1.x` 与 `^0.2.0` 都会被 0.2 宿主**拒绝**（`^0.2.0` 展开为 `>=0.2.0 <0.3.0-0`，而 rc 版本小于 `0.2.0`），只有 `^0.2.0-rc.1` 一类范围被接受。
- 已用桌面版内置的 semver 7.8.5 逐包复核：本仓库 8 个包的全部 DSH peer 在 `0.2.0-rc.2` 上均被接受。
- 依赖的 DSH 包：`dsh-client-shortcuts`、`dsh-client-store`、`dsh-client-locale`、`dsh-client-ui-renderer`、`dsh-client-ui-settings`、`dsh-client-ui-settings-general`、`dsh-client-ui-slots`、`dsh-host-webserver`、`dsh-settings`。

## 3. 架构

插件是**双半边**结构，两侧各承担一半职责。

**Host 半边**（`src/index.ts`）

- 声明 `Config`，字段 `zoomPercent` 带 `.volatile()`，因此是响应式 getter，并由 `ctx.settings.configure({ auto: false }, ctx.fiber)` 绑定到 Host 用户设置文档 —— 一次拿到 profile 级持久化与设置页可编辑性。
- 通过 `ctx.on('webserver/index-inject', …, { prepend: true })` 推入一条 `{ kind: 'style', text: ':root{zoom:N}' }`，在任何浏览器插件启动前生效，消除首屏闪烁。

**Client 半边**（`src/client/index.tsx`）

- 在文档元素上写入内联 `zoom`，用 `ctx.effect` 绑定生命周期，插件卸载时 `removeProperty` 回收。
- 用 `ctx.shortcuts.register` 注册三条命令，**只声明 `desktop:*` 默认绑定**：浏览器已把 `Mod+=` / `Mod+-` / `Mod+0` 占用为原生页面缩放，声明 Web 默认值既抢键也无意义；需要 Web 的用户可在自带快捷键面板里自行绑定。
- 注册 `settings.general.item` 行（`id: ui-zoom`，`order: 12`），排在自带「外观」(10) 与「字号大小」(11) 之后。

**纯逻辑抽离**（`src/zoom.ts`）：夹取、步进、百分比到 CSS 值的换算、启动样式字符串构造，全部是不依赖 DOM 的纯函数，因此缩放策略可以脱离 jsdom 单测。

### 数据流

```
快捷键 / 设置行
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

1. 用目标版本内置的 semver 复核所有 `@deepseek-ai/dsh*` peer 是否仍然被接受 —— 这是安装期与启动期的硬门禁。
2. 复核 `ctx.shortcuts.register` 的 `ShortcutCommand` 字段集合（0.2 要求 `id`/`label`/`aliases`/`defaults`/`regions`/`modals`/`resolve` 全部齐备，且 `id` 是 branded 类型）。
3. 复核 `settings.general.item` 槽位声明与 `PropsRuntime`/`PropsStore`/`PropsLocale` 的派生契约。
4. 重新执行真实 profile 冷启动 E2E，并在本文件第 4 节更新记录。
