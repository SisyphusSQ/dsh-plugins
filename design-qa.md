# DSH 思考折叠视觉 QA

## 对照基准

- 视觉真源：`/var/folders/j1/blrv77y956q8d747sb8pqfvm0000gp/T/codex-clipboard-9e54c7ce-ecca-416a-84d4-0ee3d0a5ac8b.png`
- 真源尺寸：`2004 × 374`，按 2× 密度归一化后检查折叠行。
- 实现页面：DSH `0.1.0-rc.6`，隔离 profile `web-thinking-collapse-e2e`，`1280 × 720` 视口。
- 验证状态：中文、浅色、reasoning 已结束、折叠、事件计时为 2 秒。
- 完整页面证据：`/Users/suqing/.codex/visualizations/2026/08/14/019fffad-d934-7020-873f-ef368e7c8f97/dsh-thinking-collapse-final-full.png`
- 折叠态并排对照：`/Users/suqing/.codex/visualizations/2026/08/14/019fffad-d934-7020-873f-ef368e7c8f97/design-qa-final-comparison.png`
- 展开态证据：`/Users/suqing/.codex/visualizations/2026/08/14/019fffad-d934-7020-873f-ef368e7c8f97/dsh-thinking-collapse-final-expanded.png`

## 视觉面检查

| 面 | 最终实现 | 结论 |
| --- | --- | --- |
| 字体 | 状态文案 `16px / 24px`、字重 `400`，沿用 DSH 系统字体 | 与参考图的正文级状态标签一致 |
| 间距 | 文案与箭头间距 `6px`，底部留白 `10px`，分隔线 `1px` | 通过 |
| 颜色 | 使用 DSH `label-secondary` 与 `border-l2` token | 保持宿主主题一致 |
| 图标 | 使用 DSH 原生 14px 右箭头；展开时由 `DisclosureRow` 切换原生下箭头 | 未制作或近似绘制资产 |
| 文案 | 中文显示“耗时 2秒”，长时长显示“耗时 1分钟 8秒” | 与参考表达一致 |
| 隐私形态 | 折叠态不显示 reasoning 首行、末行或摘要 | 通过 |
| 宽度 | 分隔线跟随 DSH 聊天内容列宽，不扩展到 Codex 的页面宽度 | 宿主布局约束，P3 差异 |

## 迭代记录

1. 首轮对照发现状态文案为 `14px`，相对参考图偏小，记为 P2。
2. 调整为 `16px / 24px` 后重新构建、安装并截图。
3. 最终并排对照未发现 P0、P1 或 P2 视觉问题。

## 交互与运行检查

- 点击“耗时 2秒”后按钮进入 expanded 状态，完整 reasoning 可见。
- 再次点击后恢复折叠，reasoning 正文从可访问性树中消失。
- 折叠态保留“耗时 2秒”按钮标签，不包含内容预览。
- 浏览器控制台 warning/error：`0`。
- 类型检查、3 个测试文件共 10 个测试、构建均已通过。

Final result: passed
