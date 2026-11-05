# dsh-ui-zoom

[English](README.md) | 中文

DeepSeek Harness 整体界面缩放插件：入口是设置页的「整体界面缩放」行。

`0.2.0` 面向 DSH `0.2.2-rc.1`、Cordis `4.1.0` 和 Node `>=24.9.0`。声明的 DSH 范围为 `>=0.2.2-rc.1 <0.3.0`；仓库检查使用精确的 `0.2.2-rc.1` DSH 依赖群，不代表已验证范围内每个版本。包测试和浏览器 fixture 不等于真实 DSH profile 启动或产品 E2E。

## 它能做什么

DeepSeek Harness 自带的排版控制只有一个「外观 → 字号大小」，而且它**只作用于会话内容**（`--dsh-content-font-size`，10–22 px）。侧边栏、设置页、按钮和菜单读的是另一套固定的 `--dsw-*` 令牌，没有任何东西会缩放它们。

本插件缩放的是**整个界面**，范围 50%–300%，入口是**设置 → 通用 → 整体界面缩放**：该行显示当前百分比，带 −/+ 按钮和重置。设置是持久的——它存在当前 profile 的 `ui-zoom` 插件配置中，因此重启后保留、并跟随 profile。

选择会立即生效，支持快速连续点击。最新选择尚在保存时，较早的 Host 刷新不会覆盖该选择；有序写入结束后，设置行以 Host 值收敛，并继续采纳外部设置变更。保存被拒绝或连接中断时，会恢复最近已知的 Host 设置并显示行内错误。

## 缩放是怎么实现的

文档元素上写入一个 CSS `zoom`：

```css
:root { zoom: 1.25 }
```

有两个细节是刻意的。

**挂在文档元素上，而不是应用根节点。** 菜单、弹窗、悬浮卡片、toast 和灯箱全部通过 `createPortal` 挂到 `document.body`。如果规则只作用于 `#root`，所有浮层都会保持原尺寸不变，所以缩放要挂高一层，让整个页面都在它里面。

**用 `zoom` 而不是 `transform: scale`。** `zoom` 会连同内容一起缩放布局和命中测试；脚本输出的视口坐标仍需下述补偿，缩放本身不会转换它们。`transform: scale` 会让布局计算停留在未缩放空间，并为 fixed 定位的后代新建包含块。

**视口单位反向补偿。** 注入样式将壳层尺寸设为 `100vh / z`，并限制直接使用视口高度的子节点，抵消 CSS `zoom` 对视口长度的再次放大。

**脚本拥有的视口像素会补偿。** `MutationObserver` 校正 fixed 浮层明确的 `px` 偏移，以及 DSH 的 `--dsh-anchored-max-width` / `--dsh-anchored-max-height` 可视视口上限。锚点派生的行内最小宽度同步校正；无关的设计最小宽度和 `%`、`em`、`calc(...)` 等相对长度保持原样。按属性独立记录，动态缩放时重新计算，卸载时恢复仍由插件拥有的值，不覆盖外部新写入。这不会替换 Host 的定位算法。

**Better Sidebar 的视口浮层也会补偿。 嵌套的 `data-dsh-panel-host` 使用 `100vh`，同样需要按缩放倍数反向校正高度，避免触发其降级定位循环并持续撑长文档滚动区。

Host 半边通过 `webserver/index-inject` 在任何浏览器插件启动前注入样式表。客户端接管同一张表，将它移到宿主样式表之后，随缩放变化更新，并在卸载时移除。因此恢复 100% 时不会重新激活旧的启动补偿。

## 配置

插件拥有 `ui-zoom` 设置命名空间。它的 Cordis 行接受一个字段：

| 字段 | 默认值 | 范围 | 含义 |
|---|---|---|---|
| `zoomPercent` | `100` | 50–300 | 整体界面缩放百分比 |

如果你希望界面长期更大，可以直接在配置行上固定缩放百分比（设置行是唯一交互入口）：

```yaml
- id: ui-zoom
  name: '@suqingsq/dsh-ui-zoom'
  config:
    zoomPercent: 125
```

## 与「字号大小」的关系

两者互相独立，且是相乘关系。界面缩放 125% 配合 16 px 的会话字号，会话正文实际渲染约 20 px。设置行里写明了这一点，避免把两个控件混为一谈。

## 验证

在精确 DSH `0.2.2-rc.1` 依赖群上运行类型检查、构建和单测/注册契约测试。Host fixture 使用真实 Cordis/Settings 服务检查 raw 与 effective 配置、默认值、更新和清理；有序写入测试执行已发布的 settings 客户端工厂，仅控制 Remote 传输。

构建后，可在开发仓库执行 `pnpm --filter @suqingsq/dsh-ui-zoom test:browser`，使用已安装的 Chrome/Chromium（可通过 `CHROME_BIN` 指定）做真实布局回归。这是依赖 TypeScript 等开发工具链的开发入口，不是消费者运行入口。覆盖 50/100/115/150/300%、连续整页滚动、内部滚轮和动态缩放；锚点 fixture 还通过受控 effect/state 适配器和可视视口输入执行精确目标 hook 与菜单 CSS，检查尺寸上限、锚点最小宽度及内部滚动可达。来源、校验值、许可证和证据边界见 [`tests/fixtures/README.md`](tests/fixtures/README.md)。

这些检查不等于真实 DSH Web/Desktop 启动、全部菜单定位正确或产品 E2E；更广的兼容记录仍在 [`docs/design/dsh-ui-zoom.md`](../../docs/design/dsh-ui-zoom.md)。

## 许可

MIT — 见 [LICENSE](LICENSE)。
