# DSH Composer Skill 提及设计

- 状态：已完成 rc.6 实现与隔离 Web profile 验证，尚未发布到 npm registry
- 目标包：`dsh-composer-skill-mention`
- 验证基线：`@deepseek-ai/dsh@0.1.0-rc.6`
- 设计日期：2026-08-14

## 目标

为 DSH Web composer 增加 Codex 风格的 Skill 提及入口：

- 输入 `$` 时展示当前会话可用的 Skills；
- 输入全角人民币符号 `￥`（U+FFE5）时提供完全相同的候选；
- 从任一入口选中 Skill 后，统一写入规范形式 `$skill-name`；
- 宿主在进入 Agent step 前解析 `$skill-name` 或 `￥skill-name`，并复用 DSH 的 Skill registry、用户调用策略与规范渲染结果；
- 保留现有 `/skill-name` 行为，不改变命令与 Skill 的既有冲突规则。

本能力不执行 Shell，不创建命令通道，也不读取 Skill 文件路径作为消息协议。

## 非目标

- 本包不实现 `@` 文件提及；该能力具有不同的文件检索、权限和上下文注入边界，应独立成包。
- 本包不支持半角日元符号 `¥`（U+00A5）；本期只覆盖 `$`（U+0024）与用户明确要求的 `￥`（U+FFE5）。
- 本包不修改已安装的 DSH 文件，也不依赖 `postinstall` 热补丁。
- 本包不把本地绝对 `SKILL.md` 路径序列化进消息。

## 用户交互契约

```text
$dis  ─┐
       ├─> 当前 session 的 skill.list ─> 选择 discuss-first ─> $discuss-first
￥dis ─┘
                                                        │
                                                        └─> pre-step 加载 Skill 正文
```

具体规则：

1. `$` 与 `￥` 只在 draft 开头或空白字符后打开候选，避免 `foo$bar`、`\$name` 和代码标识中的符号误触发。
2. 两个入口共享同一份按 session 缓存的 Skill catalog；preset 切换或连接重置时失效。
3. 候选采用前缀过滤，并沿用 `skill.list` 返回的描述和 `modelInvocable` 标记。
4. 从 `￥` 菜单选中后也写入 `$name`，保证消息、复制和跨端表达只有一个规范形式。
5. 手工输入或粘贴 `$name`、`￥name` 也具有相同宿主语义；解析范围仅限直接用户消息、空白边界和 DSH 的 kebab-case Skill 名语法。
6. 未找到或不允许用户调用的 Skill 保持普通文本，不伪装成成功调用。
7. 同一消息通过 `/name`、`$name`、`￥name` 重复提及同一个 Skill 时，正文只注入一次。
8. composer 已进入 command claim 或 frozen 阶段时，不激活 `$` / `￥` 候选。

## DSH rc.6 现状与约束

`@deepseek-ai/dsh-client-ui-input-trigger@0.1.0-rc.6` 存在一个不对称契约：

- `ctx.inputTriggers.registerSource()` 的运行时 registry 可以保存任意 `trigger` 字符串；
- `TriggerChar` 类型和 `detectTrigger()` 实现却只接受 `/` 与 `@`；
- `dsh-client-ui-skill` 只注册 `/` source，选中后插入普通文本 `/name`；
- `dsh-tool-skill` 的用户显式调用解析器只识别 `/name`；
- composer 的普通文本引用装饰只识别 `/` 与 `@`。

因此，仅注册 `$` source 不会打开菜单；仅修改检测器又会得到“菜单可见但宿主不加载 Skill”的半成品。

## 实现架构

本包同时包含 Host 与 Web client 两个入口，并通过 `cordis.patch.yml` 作为一个 profile bundle 安装。

### Client：候选与 rc.6 兼容层

Client 入口完成两件事：

1. 注册 `$`、`￥` 两个逻辑上同源的 Skill source；
2. 对 rc.6 导出的 `InputTriggerController.prototype.track` 安装窄幅、可卸载的兼容实现。

兼容实现保留 rc.6 的 menu、candidate fetch、CAS span 和 source registry，只替换触发检测这一段：

- `/`、`@` 继续使用原边界和 guard 规则；
- `$`、`￥` 使用更严格的“开头或空白后”边界；
- 检测结果仍交给原 controller 的 roster、menu reducer 与异步候选流程；
- plugin dispose 时，仅当 prototype 仍由本包持有才恢复原方法，避免覆盖其他后来安装的兼容层。

这是有意限制在 `rc.6` 私有形状上的兼容层。包的 peer dependency 固定为 `0.1.0-rc.6`，运行时还会检查 controller 所需成员；形状不匹配时回退原 `track` 并输出一次明确错误，不破坏 `/` 与 `@`。

选择结果沿用 DSH 内置 `/skill` 的 plain-text-reference 决策，写入 `$name `。这样 Web 选择、手输、粘贴和非 Web 文本入口共享同一个宿主协议。由于 rc.6 的 composer 装饰正则仍是 `/`、`@`，`$name` 不会获得内置引用着色；这属于已知视觉边界，不影响候选或 Skill 注入。

### Host：Skill 注入

Host 入口在 `agent/pre-step` 注册 `prepend` waterfall listener：

1. 先调用 `next()`，让内置 `dsh-tool-skill` 处理 `/name` 并完成其他背景注入；
2. 扫描当前 step 中直接用户消息里的 `$name`、`￥name`；
3. 从下游 decision 的 `skill-invocation` metadata 收集已注入名称；
4. 对尚未出现的名称调用 `ctx.skills.get()`；
5. 仅对 `isUserInvocable()` 为真的定义追加 `renderSkillContent()` 结果。

通过先委托、后去重，`/foo $foo` 不会重复加载正文；由其他插件生成的文本也不能伪造用户显式调用。

## 包结构

```text
packages/dsh-composer-skill-mention/
├── src/
│   ├── client/
│   │   ├── catalog.ts
│   │   ├── compat.ts
│   │   ├── detect.ts
│   │   ├── index.ts
│   │   └── source.ts
│   ├── index.ts
│   ├── mentions.ts
│   └── upstream-rc6.d.ts
├── tests/
├── README.md
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── package.json
├── tsconfig.json
├── tsdown.config.ts
└── cordis.patch.yml
```

## 失败语义

- `skill.list` 失败：当前候选组关闭并在浏览器控制台记录原错误；下次打开允许重试。
- 候选请求被新输入 supersede：只放弃该次结果，不中止共享 catalog 预热。
- Skill 不存在或禁止用户调用：不注入正文，原文本照常进入模型请求。
- pre-step 被下游拒绝：原样返回 reject，不进行 Skill 加载。
- rc.6 controller 形状不匹配：保留原 `/`、`@` 行为，禁用别名检测并记录兼容错误。

## 验收标准

- `$`、`￥` 均能打开相同 Skill 候选，并按输入前缀过滤。
- 通过 `￥` 选择后写入 `$name`。
- `$name` 与 `￥name` 都能加载相同 Skill 正文。
- `/name $name ￥name` 只产生一条 `skill-invocation`。
- `$HOME`、`foo$bar`、`$foo/bar`、`\$name`、未知 Skill 不产生 Skill 注入。
- preset 切换和 connection reset 后不复用旧 catalog。
- 插件卸载会注销两个 source、取消 catalog 请求并恢复 controller prototype。
- 构建产物包含 Host ESM、Web client bundle、类型声明和 `cordis.patch.yml`。
- npm pack 内容、静态配置组合和本地包验证通过。

## 验证边界

单元测试、类型检查、构建、npm pack 与 profile 配置 dump 只能证明实现和装配契约；只有在真实 `@deepseek-ai/dsh@0.1.0-rc.6` Web profile 中完成候选选择并观察 `skill-invocation`，才能称为 DSH Web E2E。

2026-08-14 的隔离 Web profile 验证已覆盖 `￥` 前缀过滤、选择后归一化为 `$name`、真实模型发送、页面上下文注入和会话存储中的 `skill-invocation` 元数据。模型按固定测试指令返回 `skill mention e2e ok`，会话未产生工具调用。

## 上游迁移方向

后续优先推动 DSH 将 trigger detection 改为 registry-driven，并让 source 声明边界与 guard tier。上游提供正式扩展点后，应删除 prototype 兼容层，只保留 Skill source 与 Host 别名注入；不得无限期扩展对私有 controller 形状的兼容分支。
