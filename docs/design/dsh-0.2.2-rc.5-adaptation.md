# DSH 0.2.2-rc.5 适配记录

2026-11-20。源码基线 `ca6bad12f3676c9ae2ea9ab35cc16d40335642e3`，与 `origin/main` 一致；原适配目标及历史证据见 [rc.1 记录](dsh-0.2.2-migration.md)。本轮目标为 npm `latest` / `next` 和本机 Desktop 一致的 [DSH 0.2.2-rc.5](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.5)，tag 指向 `9c2670d3bce5275e0d1610272958121af87787bb`。开发依赖与 Bridge 的运行时 hook protocol 精确对齐，DSH peer 起点 `^0.2.2-rc.5`，宿主范围 `>=0.2.2-rc.5 <0.3.0`；不宣称逐个验收范围中的其他版本。

## 实际命中的契约

- Session Tools `0.5.0`：`AgentRegistry.roots()` 被移除。按新版 Session Controller 的 `session.header.origin` 区分普通会话与子 Agent；保留精确的活跃 Agent、当前驱动和逐工具审批检查。普通 Fork 的历史 `parentSession` 不等于子 Agent；子 Agent 的父级不在线也不会因此获准。
- 实验性 Codex Bridge `0.3.0`：`startActivation` 将原 `request` 内的字段提到顶层；保持 `caller` 结果交付、模型继承、深度上限和取消所有权。MCP 向 Loader 传入 schema 输入，沿用上游清理超时默认值，显式关闭凭据模板展开，继续拒绝鉴权配置。回归覆盖实际 Loader、原生委派及 stdio/HTTP 夹具。
- UI Zoom `0.3.0`：原生 Menu 采用 CSS Anchor Positioning。旧 JS 偏移修正无法补偿新版长菜单的 `100dvh` 上限：Chrome 的 900px 视口在 115% 时页脚落到约 1003px。只校正一级原生菜单的高度预算，浏览器仍负责定位；保留对脚本写入固定像素坐标的原有修正。
- 未迁移宿主的账号、终端、网页搜索、Forge 和 CUA 能力；仓库未消费相应变更接口。未新增 HTTP/WS 通道、变更 profile 文件读写语义或放宽子进程与权限边界。

## 验证范围

旧版本基线通过类型检查、构建与 192 项测试。目标在 Node.js v26.0.0 / pnpm 10.33.2 上通过类型检查、构建和 193 项测试（Session Tools 42、Codex Bridge 84、UI Zoom 67）；测试包含实际 Loader/AgentLoop 组合。锁文件的 89 个 DSH 包均解析到 `0.2.2-rc.5`。Zoom 使用 [Chromium 几何夹具](../../packages/dsh-ui-zoom/tests/fixtures/README.md) 验证根菜单页脚及内部滚动，不覆盖实际 React 菜单、子菜单、WebKit 或移动视觉视口。日常 Web `127.0.0.1:3080` 不在运行，本轮没有把仓库新包安装到日常 profile，也未做产品 GUI / 真实模型端到端验收。

仓库改动保留在本地适配分支，未提交、推送或发布。源码回滚基准为上述提交及其锁文件，恢复时按原锁文件重装，不混用两个 DSH 版本的依赖。
