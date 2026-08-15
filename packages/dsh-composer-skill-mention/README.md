# dsh-composer-skill-mention

为 DeepSeek Harness（DSH）Web composer 增加 Codex 风格的 Skill 提及：输入 `$` 或全角人民币符号 `￥`（U+FFE5）筛选当前会话可用的 Skills，并在进入 Agent step 前加载被提及的 Skill 正文。

> 状态：实验中，尚未发布到 npm。当前只验证 `@deepseek-ai/dsh@0.1.0-rc.6`，不承诺兼容其他版本。

## 行为

- `$dis` 与 `￥dis` 打开相同的 Skill 候选；
- 从任一候选菜单选中后都写入规范文本 `$skill-name `；
- 手工输入或粘贴 `$skill-name`、`￥skill-name` 具有相同的宿主语义；
- 只解析直接用户消息中位于开头或空白后的 kebab-case Skill 名；
- 未知或禁止用户调用的 Skill 保持普通文本；
- `/name $name ￥name` 混用时只注入一次 Skill 正文；
- `$HOME`、`foo$bar`、`$foo/bar`、`\$name` 和半角 `¥name` 不会产生 Skill 注入。

本插件不执行 Shell，也不会把本地 `SKILL.md` 绝对路径写进消息。它调用 DSH 的 Skill registry，并复用 `renderSkillContent()` 生成规范的 `skill-invocation` 上下文。

## 兼容性

| 项目 | 当前边界 |
| --- | --- |
| DSH | 仅 `0.1.0-rc.6` |
| Node.js | `>=22` |
| Client | DSH Web |
| Host | DSH Agent `pre-step` |
| `￥` | 支持 U+FFE5 |
| `¥` | 不支持 U+00A5 |

DSH rc.6 的 source registry 能保存任意 trigger，但公开检测器只识别 `/`、`@`。因此本包包含一个针对 rc.6 的窄幅、可卸载兼容层：仅在光标位于 `$` 或 `￥` token 时复用现有 controller 状态机；其他输入继续调用原实现。controller 形状不匹配时会禁用别名并输出明确错误。

上游提供 registry-driven trigger 扩展点后，应删除这个兼容层。

## 本地安装

在本仓库根目录构建并打包：

```bash
pnpm install
pnpm --filter dsh-composer-skill-mention test
pnpm --filter dsh-composer-skill-mention typecheck
pnpm --filter dsh-composer-skill-mention build
pnpm --filter dsh-composer-skill-mention pack
```

然后把生成的 tarball 安装进目标 DSH profile：

```bash
dsh plugin --profile <profile> add ./packages/dsh-composer-skill-mention/dsh-composer-skill-mention-0.1.0.tgz
```

安装会把 bundle 中的 `composer-skill-mention` 节点合入 profile。请先备份或使用专门的测试 profile；本仓库不通过 `postinstall` 修改 DSH 安装目录。

DSH profile 使用 `autoInstallPeers: false`，从 tarball 安装时 pnpm 可能列出由 DSH profile 提供的 peer dependency 警告。不要据此在 profile 中重复安装另一套 DSH 核心；应通过 `dsh --profile <profile> --dump-config` 和实际启动确认所选 profile 提供的是兼容版本。

## 卸载

```bash
dsh plugin --profile <profile> remove dsh-composer-skill-mention
```

Client fiber 卸载时会注销 `$`、`￥` 两个 source、中止 catalog 请求，并在仍由本包持有时恢复 controller 原方法。

## 已知限制

- rc.6 的 composer 文本装饰只识别 `/`、`@`，所以 `$name` 不会获得内置引用着色；候选和 Skill 注入不受影响。
- 候选中的 `User only` 标记当前使用英文，尚未增加独立 locale namespace。
- profile 中同时安装多个修改 `InputTriggerController.prototype.track` 的第三方插件时，需要单独验证组合顺序。
- 本包不包含 `@` 文件提及；文件检索与权限边界应由独立插件处理。

## 验证边界

单元测试覆盖别名检测、直接用户来源约束、候选归一化、catalog 单飞缓存、rc.6 controller 路由、宿主注入与 `/` 去重。类型检查、构建、npm pack 和隔离 profile 配置验证属于本地装配证据。

2026-08-14 已在隔离的 DSH `0.1.0-rc.6` Web profile 中观察到：`￥apifox-b` 过滤到 `apifox-branch`，点击后 draft 变为 `$apifox-branch`，真实模型返回 `skill mention e2e ok`，页面显示 `apifox-branch` 上下文注入，会话存储记录 `kind: skill-invocation`，且没有工具调用。

只有在真实 `@deepseek-ai/dsh@0.1.0-rc.6` Web profile 中输入 `$` / `￥`、选择候选并观察 `skill-invocation`，才能称为 DSH Web E2E。

详细设计见 [`../../docs/design/dsh-composer-skill-mention.md`](../../docs/design/dsh-composer-skill-mention.md)。

## License

[MIT](LICENSE)。rc.6 兼容逻辑基于 DeepSeek Harness 的 MIT 实现行为，归属说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
