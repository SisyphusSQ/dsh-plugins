# DSH 后续输入预测插件方案

- 状态：自研方案仍为待确认草案；2026-10-25 已按用户授权安装现成候选 `dsh-prompt-predict@0.2.8`，Host 已加载；预测效果与 GUI 交互待用户试用，见第 9 节。
- 初始调研：2026-10-24；保存日期：2026-10-25（Asia/Shanghai）。
- 用户需求：每轮回复结束后预测下一条用户输入；设置中可以从 DSH GUI 已配置的全部订阅中选择一个，并独立配置模型和 Effort。
- 当前授权：保存方案与对比研究，并安装推荐的现成插件供用户试用；安装必需的 profile 依赖与 bundle 登记在本轮授权内，不授权自研功能开发、擅自调整模型/Effort 或发布。
- 来源会话：`session-b959b5b4-e164-4c3f-b1de-6abc7c8a5947`。

## 1. 目标与行为

参考 [Codex Composer Predictions 官方说明](https://learn.chatgpt.com/docs/features/composer-predictions)：在每轮回复后，根据当前会话预测用户下一条可能输入的消息；接受后成为可编辑草稿，不自动发送。

这里的“结束”指一次 Agent 轮次完成，不是关闭或销毁会话；预测对象是用户后续消息，而非 Agent 自动执行的下一步。

本插件建议与主 Agent 的模型路由、上下文和工具权限分离，不通过修改主提示词或启动工具型子 Agent 实现。

## 2. 设置

| 设置项 | 语义 |
| --- | --- |
| 启用预测 | 独立开关；关闭后取消任务并清除建议 |
| 预测订阅 | 复用 DSH 已配置 provider 路由目录，选择其中一个；不可用项保留状态与原因 |
| 预测模型 | 模型列表加适配器支持的自定义模型 ID；不修改主会话模型 |
| 预测 Effort | 按精确 provider/model 的能力动态显示；另有“使用模型默认值” |

“全部订阅可选”不等于全部处于可调用状态：未激活、认证失效、模型不可解析或目录加载失败必须明确区分。模型目录不是所有适配器的唯一约束，自定义 ID 仍可能被适配器或上游拒绝。Effort 不是通用固定枚举，不能静默改写或忽略不支持的显式值。省略 Effort 使用模型/适配器默认值，不保证低推理，也不继承聊天选择。

认证、凭据和刷新由 DSH 已有适配器处理。插件只保存路由和模型选择，不复制凭据。

## 3. 调度与上下文

流程：当前可见会话正常完成一轮 → 截取有限上下文 → 使用独立配置调用模型 → 检查会话、轮次、草稿及配置版本 → 展示建议 → 用户接受为草稿。

- 默认只对正常完成的轮次预测，不把错误、取消、崩溃恢复或 Fork 合成结束当作正常完成。
- 只为当前有 UI 消费需求的会话生成，不扫描历史或为所有后台会话批量生成。
- 使用当前会话已有的有限文本上下文，不主动检索其他会话、记忆、连接应用，不默认发送附件、原始工具输出或推理内容。
- 保留“仅讨论、暂不实施”等明确约束；预测用户可能输入什么，而非泛化的任务推荐。
- 无合理后续时允许不返回建议，不强行推动新任务。
- 用户输入、新轮次、切换会话、配置变化或会话释放后，取消或丢弃过期结果。
- 按会话、完成事件和配置版本去重，限制并发、输入预算、输出及耗时。
- 预测失败不影响主会话，不自动切换其他订阅作为兜底。
- 未接受的预测只保存在插件临时状态，不成为聊天消息；接受仅写入草稿，发送仍由用户执行。

## 4. 交互与纯插件边界

推荐在输入框附近用轻量预测条显示一条候选，提供接受和忽略；优先使用宿主公开插槽和输入动作，不接管整个 composer，不操作私有 DOM 或 Lexical 状态。

已有草稿版本保护的插入接口可用于接受建议；不能直接用无版本比较的整段草稿替换覆盖用户输入。

Tab 接受存在固定输入扩展路径，但需要实测中文 IME、焦点、弹窗及 `@`、`/` 菜单的优先级；按钮接受也必须可用。

**原生行内灰字不在已确认的纯插件能力范围内。** 截至本轮未找到随光标、换行和选择区排版的专用 prediction/decorator 公共接口。普通 overlay 不是编辑器文字流。若要求完全复刻原生行内效果，应先推动宿主提供扩展点，不能把依赖核心改动的实验当作已成立的纯插件。

## 5. 结构与已核对接口

建议一个包包含 Host 与 Client 两个入口，作为一个独立安装能力；尚未创建包、保留名称或注册公共标识。

- Host：订阅与模型元数据、上下文提取、预测调用、取消/去重/资源限制、受控 Remote。
- Client：设置页、当前会话与草稿状态、预测条、接受/忽略和快捷键仲裁。

已核对当前应用 `0.2.1-rc.3` ASAR 实现及本仓库 `0.2.1-rc.2` 公开类型；这是静态可行性证据，不是插件兼容性或运行验证。

| 需求 | 接口/边界 |
| --- | --- |
| 完成后触发 | Host `session/event` 中的 `turn/end`；默认 `reason.kind === 'completed'`；不使用会被等待且发生在结束前的 `agent/turn-stopping` |
| 路由和模型 | `ctx.llm.listProviders()`、`listConfigurableProviders()`、`listModels()`、`resolveModelInfo()`；GUI 的 `remote.session.modelCatalog()` 可供参考，但会过滤空组并单列失败 |
| 独立调用 | `ctx.llm.prepareCall()` → `call.stream()`，或 `ctx.llm.stream()`；不调用 `session.selectModel()` |
| 预测用途标记 | 当前 `purpose` 只有 `compaction`、`session-title`；可以省略，不得冒充标题；专用分类需宿主扩展 |
| 设置 | `settings.section`、`ctx.configForms.get(namespace)`、插件 volatile 配置；可参考本仓库 Codex Home 设置页 |
| 展示 | session-scoped `conversation.input.overlay`、`conversation.input.dock`、`conversation.composer.dock` |
| 草稿与接受 | `useInput()`、`draftRev`、`inputActions.captureInsertion()`、`inputActions.insertText()`；不要调用 `submit()` |
| 快捷键 | `ctx.shortcuts.registerFixed()`、`observeFixedInput()`；Tab 不是跨平台任意可注册的普通快捷键 |
| 结果传递 | 自建带严格输入 codec 和会话授权的 Remote；浏览器没有公开通用 `remote.llm.stream()` |

仓库尚未安装部分 composer/shortcut/session UI 开发类型，实施前需按目标宿主补齐类型闭环，不能把 rc.2 类型推断当成 rc.3 实测。

## 6. 安全、费用与验收入口

- 复用 Host 鉴权；预测 RPC 验证会话可访问性，不能信任客户端任意会话 ID。
- 凭据留在 Host；内容按纯文本展示，不执行预测文本或 transcript 内指令。
- 设置页明确说明：使用另一供应商的订阅会把选取的会话内容发送给该供应商。
- 预测是独立模型调用，会消耗所选订阅额度或产生 API 费用；不能套用 Codex 官方预测不计入用量的待遇。
- 验收覆盖订阅目录状态、模型/Effort 真实传递、配置独立、过期结果、取消/去重、草稿保护、IME/菜单快捷键、会话隔离及卸载清理。
- 完整 UI 闭环必须在授权后的真实日常 DSH GUI 验证；静态检查、构建或 fixture 不能代替。

## 7. 待确认与后续

1. 是否采用输入框附近的预测条，还是要求原生行内灰字；后者需要宿主扩展点。
2. GitHub 同类实现见下文“GitHub 对比调研”；参考建议不代表已选型、已安装或已授权实施。
3. 用户确认并授权实施后，才进入命名、包创建、开发和验证。

## 8. GitHub 对比调研（2026-10-25）

### 8.1 范围与证据口径

检索 GitHub 仓库与公开讨论，使用 `dsh-composer-predictions in:name`、`dsh prompt predict in:name,description`、`deepseek-harness predictions plugin` 等查询，并对下列代表实现核对 README 与源码。公开搜索不是全网穷尽结果；搜索目录和 npm/第三方市场摘要仅用于发现，技术判断以固定提交源码为准。

仅只读访问公开资料：没有 clone、安装、执行外部项目代码、读取凭据、修改 DSH 配置或发起预测模型请求。仓库版本与许可证元数据不代表 registry 对应版本已回读或当前 GUI 已兼容。项目 README 宣称的测试结果不是本轮独立验证。

| 代表项目 | 本轮核对提交 | 元数据/定位 |
| --- | --- | --- |
| [ferrisching/dsh-prompt-predict](https://github.com/ferrisching/dsh-prompt-predict/tree/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c) | `43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c` | 源码 package 0.2.8；MIT；README 声称验证于 DSH 0.2.1-rc.3；未归档 |
| [Stijnus/dsh-composer-predictions](https://github.com/Stijnus/dsh-composer-predictions/tree/c593b2b1383d7fb639617107f45d24d78845758d) | `c593b2b1383d7fb639617107f45d24d78845758d` | 源码 package 1.2.0；MIT；下一条预测加草稿续写；未归档 |
| [omdsh-dev/dsh-advisor](https://github.com/omdsh-dev/dsh-advisor/tree/9ffa38340945e43955badc52b84fe76ee0945b2a) | `9ffa38340945e43955badc52b84fe76ee0945b2a` | MIT；副模型审查加下一条预测；未归档 |
| [ozandogrultan/opencode-ghost](https://github.com/ozandogrultan/opencode-ghost/tree/259b619984d2d71880f6f280337b7e3188e6df35) | `259b619984d2d71880f6f280337b7e3188e6df35` | MIT；OpenCode TUI 插件，作为跨宿主生命周期参考，不可直接安装进 DSH |

其他直接同类命中包括 [Amir-Bazylkhanov/dsh-composer-prediction](https://github.com/Amir-Bazylkhanov/dsh-composer-prediction)、[boshihaihai/dsh-plugin-composer-predictions](https://github.com/boshihaihai/dsh-plugin-composer-predictions)、[yepyeel/dsh-prompt-suggestion](https://github.com/yepyeel/dsh-prompt-suggestion)、[keliwang/dsh-followup-prompt](https://github.com/keliwang/dsh-followup-prompt)、[xiehaibin18/dsh-next-prompt-suggestion](https://github.com/xiehaibin18/dsh-next-prompt-suggestion)、[MochiNek0/dsh-ghost-prompt](https://github.com/MochiNek0/dsh-ghost-prompt)。命中不等于这些项目均已完成源码审查或运行验证，不按搜索排名推断质量。

### 8.2 最接近原需求：dsh-prompt-predict

**相同点：** Host + Client 一包；读取近期 user/assistant 普通文本；复用 `ctx.llm` 和已有 provider 认证；设置页选 provider/model 与动态 Effort；接受调用 `captureInsertion()` / `insertText()`，不自动发送。默认最近 8 条、总预算 6000 字符；不把工具、附件、system/developer 原始块放入预测请求。

**具体实现：**

- Client 使用 `conversation.composer.dock` 作为挂载点，观察 `running`、空草稿等状态，延迟 350ms 发起请求。不是直接按正常 `turn/end` 的 reason 精确过滤；首次挂载非空历史会话也可能请求预测。[触发源码](https://github.com/ferrisching/dsh-prompt-predict/blob/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c/client/src/04-composer.js#L107-L162)
- 文本历史被格式化成一个辅助请求的 user 消息，用专门的 system prompt 要求输出一句用户下一条消息。默认跟随已用会话路由，可固定另一 provider/model。[上下文裁剪](https://github.com/ferrisching/dsh-prompt-predict/blob/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c/lib/predict.mjs#L155-L188)、[实际调用](https://github.com/ferrisching/dsh-prompt-predict/blob/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c/lib/predict.mjs#L244-L307)
- 自建 `/dsh-prompt-predict` HTTP API，执行 Host browser-cookie 拒绝检查；支持普通 JSON 和 NDJSON 流式预测。[入口与鉴权](https://github.com/ferrisching/dsh-prompt-predict/blob/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c/lib/host-route.mjs#L241-L254)、[流式响应](https://github.com/ferrisching/dsh-prompt-predict/blob/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c/lib/host-route.mjs#L417-L467)
- 灰字实际是 `position: fixed` 的独立覆盖层：查找编辑器、读取矩形与字体、监听 resize/scroll，并按 placeholder class 修改原占位符可见性。不是原生 Lexical decorator。[灰字实现](https://github.com/ferrisching/dsh-prompt-predict/blob/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c/client/src/03-core.js#L233-L297)
- Tab/Esc/Alt+右箭头通过 window capture `keydown` 处理；有 IME、paste、beforeinput、drop 隐藏处理。整条及分段接受使用公开插入动作。[接受](https://github.com/ferrisching/dsh-prompt-predict/blob/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c/client/src/04-composer.js#L210-L233)、[键盘处理](https://github.com/ferrisching/dsh-prompt-predict/blob/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c/client/src/04-composer.js#L263-L302)

**与本方案的关键差异：**

1. 设置不走原生 ConfigForms，而是独立 JSON 文件及自建设置 API；最近预测文本、当前会话和暂停状态使用 localStorage。本方案倾向宿主原生配置存储、预测文本默认临时保留。[设置存储](https://github.com/ferrisching/dsh-prompt-predict/blob/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c/lib/config.mjs#L7-L23)、[Client 本地历史](https://github.com/ferrisching/dsh-prompt-predict/blob/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c/client/src/03-core.js#L1-L47)
2. 显式路由设置通过 `listModels()` 检查目录成员，未实现目录外模型 ID 的输入/解析闭环；这比本方案“适配器支持的自定义 ID”更窄。provider 目录主要来自已注册 `listProviders()`，不等价于合并全部已配置但休眠/异常状态。[目录与模型校验](https://github.com/ferrisching/dsh-prompt-predict/blob/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c/lib/host-route.mjs#L176-L215)
3. 在指定 Effort 的首轮请求抛错时，会尝试移除该 Effort 再调一次；代码不只捕获“Effort 不兼容”这一种错误。返回 `effortDropped` 供 UI 记录，因此不是完全无提示，但实际请求可能不再遵循指定 Effort。另有截断重试及重复候选重试，共享一次请求的超时预算。本方案倾向明确报错，不擅自改变用户指定的模型控制值。[回退与重试](https://github.com/ferrisching/dsh-prompt-predict/blob/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c/lib/host-route.mjs#L477-L545)
4. 功能更丰富：流式预览、换一条、分段接受、语言/地区指定、临时暂停、运行历史。它们不都是当前需求，不必为了对齐功能列表全部纳入本插件。
5. 预测 system prompt 要求向前推进并输出一句，没有与 `NONE` 对应的显式无建议协议；本方案允许低把握时不显示，避免总是替用户推动实施。[提示词](https://github.com/ferrisching/dsh-prompt-predict/blob/43d4dd05e6605dfbe0ec9b88a0966a8e13f87a1c/lib/predict.mjs#L11-L24)

### 8.3 功能更广：dsh-composer-predictions（复数）

该项目同时实现“回合后下一条预测”和“输入停顿后的草稿续写”，最多多个候选，Tab 接受、Alt+上下切换、Esc 隐藏；流式部分只是预览，完成后的候选才允许接受。Host 有 JSON 与 SSE 两种接口；缓存按会话事件序号及草稿内容区分。[行为与结构说明](https://github.com/Stijnus/dsh-composer-predictions/blob/c593b2b1383d7fb639617107f45d24d78845758d/README.md#L7-L22)、[缓存及模型调用](https://github.com/Stijnus/dsh-composer-predictions/blob/c593b2b1383d7fb639617107f45d24d78845758d/index.js#L240-L292)

与本方案的区别：

- 除会话文本外，还将近期工具活动摘要纳入上下文；续写模式还发送未提交草稿。这可以提高预测信息量，也扩大了发送给预测模型的数据范围。[数据范围](https://github.com/Stijnus/dsh-composer-predictions/blob/c593b2b1383d7fb639617107f45d24d78845758d/README.md#L107-L168)
- GUI 主要提供启停开关，固定 provider/model 和 Effort 等通过部署配置设置，不是完整的 GUI 订阅/模型/Effort 选择页。Effort 先受插件自己的 `off/low/high/max` 枚举限制，再从模型实际声明中选；指定值不支持时使用最低档，不是严格保留。[配置](https://github.com/Stijnus/dsh-composer-predictions/blob/c593b2b1383d7fb639617107f45d24d78845758d/README.md#L137-L157)、[枚举](https://github.com/Stijnus/dsh-composer-predictions/blob/c593b2b1383d7fb639617107f45d24d78845758d/index.js#L31-L40)、[选择逻辑](https://github.com/Stijnus/dsh-composer-predictions/blob/c593b2b1383d7fb639617107f45d24d78845758d/index.js#L332-L339)
- 行内效果靠查询 resident composer DOM、DOM Selection/Range 测量光标、定位覆盖层；接受仍使用公开 `insertText`，但视觉定位不是宿主原生补全接口。[DOM 与光标测量](https://github.com/Stijnus/dsh-composer-predictions/blob/c593b2b1383d7fb639617107f45d24d78845758d/client.js#L165-L218)、[接受](https://github.com/Stijnus/dsh-composer-predictions/blob/c593b2b1383d7fb639617107f45d24d78845758d/client.js#L680-L692)
- 提示词支持返回 `NONE`，符合本方案“无需强行生成”的方向。[无候选协议](https://github.com/Stijnus/dsh-composer-predictions/blob/c593b2b1383d7fb639617107f45d24d78845758d/index.js#L50-L77)

不能仅根据 README 的自制竞品表推断其他项目没有某能力；本报告使用所核对版本的实际源码，不把 README 未提及当成不存在。

### 8.4 与建议条方案接近：dsh-advisor

它不是单纯预测插件，而是独立副模型审查器：会对主会话形成 severity-ranked advisory note，并可通过 `inject` / `steer` 交付；下一条预测是附带能力。模型 provider/model 必须明确配置，GUI 插件卡与会话级覆盖等走宿主设置/网关机制。[项目定位](https://github.com/omdsh-dev/dsh-advisor/blob/9ffa38340945e43955badc52b84fe76ee0945b2a/README.md#L12-L14)、[配置入口](https://github.com/omdsh-dev/dsh-advisor/blob/9ffa38340945e43955badc52b84fe76ee0945b2a/README.md#L37-L70)

预测部分与本方案相似：正常结束后异步触发，以每会话 state identity + generation 防止旧结果写回，使用增量 transcript，并支持无建议结果。Client 在 composer 下方提示条显示，空草稿/plain phase 才填入，点击或右箭头接受，不自动发送。[生命周期与隔离](https://github.com/omdsh-dev/dsh-advisor/blob/9ffa38340945e43955badc52b84fe76ee0945b2a/src/next-prompt.ts#L252-L299)、[过期保护与调用](https://github.com/omdsh-dev/dsh-advisor/blob/9ffa38340945e43955badc52b84fe76ee0945b2a/src/next-prompt.ts#L350-L459)、[提示条与草稿门禁](https://github.com/omdsh-dev/dsh-advisor/blob/9ffa38340945e43955badc52b84fe76ee0945b2a/src/client/next-prompt-overlay.tsx#L122-L190)

两个重要区别：

1. **不能从整个插件有 `reasoningEffort` 配置推断预测受它控制。** 当前提交的预测 `buildOptions()` 仅传 provider/model、system/messages、sessionId 和 signal，未传 `reasoningEffort`；因此预测使用适配器默认，而非明确的独立预测 Effort。[实际请求字段](https://github.com/omdsh-dev/dsh-advisor/blob/9ffa38340945e43955badc52b84fe76ee0945b2a/src/next-prompt.ts#L443-L459)
2. 它曾采用输入框覆盖层，后改为下方 dock tip，源码说明原因包括 placeholder 叠加、附件遮挡和边缘融合。这是支持我们建议条方向的实际维护经验，但不是本轮独立复现的故障。[交互调整依据](https://github.com/omdsh-dev/dsh-advisor/blob/9ffa38340945e43955badc52b84fe76ee0945b2a/src/client/next-prompt-overlay.tsx#L1-L40)

预测与审查模型对复用、审查注入行为、后台会话覆盖范围及额外调用费用均超出当前单纯预测需求。不能因为它有类似提示条就直接推荐整包安装。

### 8.5 跨宿主参考：opencode-ghost

它监听成功完成事件，默认防抖 500ms，以有限会话文本调用宿主独立文本生成 API，不创建辅助会话；新输入、粘贴、会话切换、新执行、禁用及卸载都进入取消路径，结果返回后再次检查上下文。预览与真实草稿分离，接受前检查焦点、模式、文本、选区和 extmarks。[触发和调用](https://github.com/ozandogrultan/opencode-ghost/blob/259b619984d2d71880f6f280337b7e3188e6df35/src/tui.tsx#L80-L186)、[生命周期](https://github.com/ozandogrultan/opencode-ghost/blob/259b619984d2d71880f6f280337b7e3188e6df35/src/lifecycle.ts#L1-L46)、[草稿保护](https://github.com/ozandogrultan/opencode-ghost/blob/259b619984d2d71880f6f280337b7e3188e6df35/src/composer.ts#L45-L95)

值得借鉴状态与取消设计，不照搬具体 TUI 渲染树定位。它可独立选 provider/model，但没有独立 Effort 设置，使用 title 模型 variant 或低推理策略；这不能替代本需求。其提示词会鼓励肯定批准和选择推荐项，不应照搬到“先讨论、未授权实施”的会话。[选项与提示词](https://github.com/ozandogrultan/opencode-ghost/blob/259b619984d2d71880f6f280337b7e3188e6df35/src/options.ts#L4-L49)、[variant 策略](https://github.com/ozandogrultan/opencode-ghost/blob/259b619984d2d71880f6f280337b7e3188e6df35/src/text.ts#L86-L151)

### 8.6 另外两种直接 DSH 实现

**GoldenLoaf24h/dsh-prompt-suggestion**：核对提交 `79119de2e6cfa762dff1eb9c570c8f7b3d995b7f`，源码 package 0.1.0、声明 MIT。已有 GUI provider/model/reasoningEffort 配置，经 `prepareCall()` 与 stream 发辅助请求，使用近期真人/助手文本，按最后回合序号缓存，因此“独立模型和 Effort”也不是本方案首创。[设置与实现说明](https://github.com/GoldenLoaf24h/dsh-prompt-suggestion/blob/79119de2e6cfa762dff1eb9c570c8f7b3d995b7f/README.md#L25-L53)

与当前需求的明显不同：

- 默认 `enterAccepts: true`，空输入框按 Enter 会采纳预测并发送；Tab 才是只填草稿。它是用户按键触发，不是无人操作自动执行，但比本方案“接受与发送分开”更容易误发。[默认值](https://github.com/GoldenLoaf24h/dsh-prompt-suggestion/blob/79119de2e6cfa762dff1eb9c570c8f7b3d995b7f/lib/index.js#L48-L80)、[Enter/Tab 路径](https://github.com/GoldenLoaf24h/dsh-prompt-suggestion/blob/79119de2e6cfa762dff1eb9c570c8f7b3d995b7f/lib/client.js#L889-L901)
- Effort 也不是严格保留：通过声明档位和阶梯选择，已知不支持的显式值会直接改用其他档位，拒绝时还会重试；`auto` 意为最低档，不是模型默认。本报告不采用源码注释中“省略 Effort 必然继承当前会话强度”的推断，应以 DSH 适配器实际默认语义为准。[Effort 选择](https://github.com/GoldenLoaf24h/dsh-prompt-suggestion/blob/79119de2e6cfa762dff1eb9c570c8f7b3d995b7f/lib/index.js#L505-L576)
- 展示靠编辑器末段落 CSS `::after` 及继承自定义属性，避免单独覆盖层测量，但仍耦合 Lexical DOM；公开 `insertText` 失败时又回退 `setDraft`，与本方案“不绕过被拒绝的版本校验”不同。[Client 实现说明](https://github.com/GoldenLoaf24h/dsh-prompt-suggestion/blob/79119de2e6cfa762dff1eb9c570c8f7b3d995b7f/README.md#L49-L53)
- README 明说自定义 HTTP 路由不经过 cookie 鉴权，只做 Origin/Sec-Fetch-Site fence；同源检查不是身份认证或会话授权，若考虑复用应先做人工安全评审，不能直接认为适合当前部署。[路由安全说明](https://github.com/GoldenLoaf24h/dsh-prompt-suggestion/blob/79119de2e6cfa762dff1eb9c570c8f7b3d995b7f/README.md#L39-L47)

**studyzy/dsh-suggest-prompt**：核对提交 `b02261d6a51bad0cd8c832b13d9def9e1e7b149e`。源码 package 1.2.3、声明 MIT，开发 DSH 依赖主要钉在 `0.2.0-rc.2`，不应据此直接推断当前 `0.2.1-rc.3` 可用。[包版本与依赖](https://github.com/studyzy/dsh-suggest-prompt/blob/b02261d6a51bad0cd8c832b13d9def9e1e7b149e/package.json#L65-L103)

它准确采用 Host 的正常完成事件门槛；保留 Host transcript 投影，默认取最近一轮，结果进入插件 storage domain 而非会话消息。这是完成触发与状态隔离的良好参考。[完成触发](https://github.com/studyzy/dsh-suggest-prompt/blob/b02261d6a51bad0cd8c832b13d9def9e1e7b149e/src/index.ts#L399-L443)

路由可固定，但 Effort 固定先试 `off`，只遇到 `UNSUPPORTED_REASONING_EFFORT` 才省略该字段重试，没有用户独立 Effort 控制；接受使用 `setDraft`，草稿门槛用 trim 后的空值判断，不完全等价于保留所有空白草稿。[辅助调用](https://github.com/studyzy/dsh-suggest-prompt/blob/b02261d6a51bad0cd8c832b13d9def9e1e7b149e/src/generate.ts#L336-L395)、[草稿与接受](https://github.com/studyzy/dsh-suggest-prompt/blob/b02261d6a51bad0cd8c832b13d9def9e1e7b149e/src/browser/GhostSuggestion.tsx#L117-L168)

### 8.7 对原方案的修正与建议（尚待用户选择）

1. **不应再把此方向当作 DSH 生态空白。** 已有多种可直接比较的同类插件，`dsh-prompt-predict` 已覆盖大部分核心需求；下一步优先按用户需求验收现成方案，再决定上游贡献、维护 fork 或独立开发。
2. **澄清灰字边界：** 插件确实可以通过 DOM/Range 测量与覆盖层做出近似灰字，甚至草稿末尾续写；原结论应表述为“未找到专用公开原生行内补全接口”，而不是“插件无法做灰字”。不依赖私有 DOM 的建议条仍是稳定性取舍，不是技术上唯一可行的外观。
3. **核心差异集中在配置契约，而非多做几种按钮：** GUI 覆盖全部已配置订阅的状态、适配器支持的自定义模型 ID、真正传递并严格尊重显式 Effort、原生设置版本冲突语义，以及只预测不审查/注入主流程。
4. **有依据地借鉴：** 预测文本与草稿分离、接受时版本校验、成功完成事件、请求取消与过期 fencing、有限上下文、`NONE`/无建议、最终候选完成后才接受、按会话/轮次/配置去重。分段接受、reroll、多候选、续写、历史记录和工具活动摘要应按需求选择，不默认扩范围。
5. **不要直接搬用：** 任意异常后去掉指定 Effort 重试、固定通用 Effort 枚举、依赖 DOM/class 改占位符、未确认授权的肯定建议、自动发送候选、整包引入审查/steer 能力，以及把本地历史误说成不涉及隐私。
6. **安全与验证缺口：** 自建 HTTP 路由还需核对宿主实际鉴权、CSRF 和会话资源授权，不能因“同源”就视为满足安全边界；本轮并未做部署安全审计或实际攻击测试。若复用 MIT 代码应保留许可和版权，不因可读源码就省略许可证要求。

上述 GitHub 调研阶段只保存原方案及对比研究，未修改产品代码、运行配置或依赖，未安装或试用插件。随后用户授权的现成插件安装记录如下；这不代表已授权自研方案实施。

## 9. 现成候选安装记录（2026-10-25）

- 用户明确要求先安装推荐候选，再自行观察效果。
- 当前目标：日常 `desktop` profile，运行 GUI `http://127.0.0.1:61934`，宿主 `0.2.1-rc.3`；未另起 profile 或服务器，也未主动重启当前应用。
- 安装来源：npm 官方 registry，精确版本 `dsh-prompt-predict@0.2.8`；不跟随 latest。
- 产物 SHA-256：`7847ac031a0e9ffac58b5906815c1f37799037997f49b85940eef7067792ac42`。
- npm SRI 已核对：`sha512-kxmbpQs4UJ7UT9XkQbsXDCYCJOKH7LrpAor5CJnfL8JRiiQ0xax8i07OXJSUJIu9X9R07lD7dirKJfuRKnjWQA==`。

### 9.1 安全审查与安装方式

完整审阅打包产物的运行时代码、入口、patch、清单与许可证；未发现任意命令/动态执行、凭据窃取或硬编码第三方外传。插件所需的同源 API 与向选定模型发送近期会话文本属于已说明的功能范围。该包无额外运行依赖，也没有 preinstall/install/postinstall/prepare 生命周期脚本。本次仍使用 `--ignore-scripts`，未运行该插件测试、构建或其他外来脚本。

中等权限风险，按已授权试用谨慎安装；静态审查不是整体安全保证。已说明默认开启、模型跟随会话、消耗额度、预测正文默认在本机 localStorage 保留 10 条，以及 DOM/键盘和在途取消边界。采纳只写草稿，无 submit/发送操作。

通过应用自带的官方 Desktop CLI 执行：

```sh
'/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' plugin --profile desktop add dsh-prompt-predict@0.2.8 --save-exact --ignore-scripts --registry=https://registry.npmjs.org
```

命令退出码 0。CLI 自动同时添加 dependency 和 bundle，无手工改写运行时源码、无需授权兼容性豁免。pnpm 自动在该 profile 的发行时间例外中增加了精确项 `dsh-prompt-predict@0.2.8`；没有修改全局策略或允许任何构建脚本。

### 9.2 保存状态与核对结果

- 已回读 [profile 依赖和 bundle 清单](</Users/suqing/.dsh/profiles/desktop/package.json>)：依赖精确为 0.2.8，bundle 已选中；原有依赖声明未改变。
- [锁文件](</Users/suqing/.dsh/profiles/desktop/pnpm-lock.yaml>) 的差异只新增该包的 importer、integrity 和空依赖快照；[workspace 配置](</Users/suqing/.dsh/profiles/desktop/pnpm-workspace.yaml>) 只增加上述精确发行时间例外。
- 安装目录内 13 个文件逐字节匹配已验证 SRI 的审查产物。
- 活跃 GUI 的 `/dsh-prompt-predict/status` 从安装前 404 变为返回本插件 `401 application/json {ok:false,reason:"unauthorized"}`：证明当前 Host 路由已加载且未放开匿名请求，不等价于已完成 GUI 挂载、已认证请求、预测模型响应或完整授权审计。
- 未替用户调整任何插件模型、Effort、语言或历史参数；未额外调用 suggest 接口。默认开启、跟随会话路由、Effort 为 off（不兼容时插件自身可能回退），超时 12 秒，最近 8 条文本、6000 字符预算、10 条本地历史。
- 安装器同时报告原有两个 `0.2.1-rc.2` browser-use 相关包与当前 rc.3 不兼容；它们在本次安装前就存在，未修改其版本或写入兼容性豁免，不将该既有警告归因于预测插件。

### 9.3 试用与回退

刷新当前 DSH 窗口后，在“设置 → 提示词联想”查看配置。完成一轮正常对话且输入框留空时观察灰字；输入框聚焦后 Tab 接受为草稿，Esc 忽略，仍须自行发送。若页面暂未显示设置，不能据此宣称 Client 已加载成功，需要再回读页面状态。

备份保存在 [本次 profile 备份目录](</Users/suqing/.dsh/profile-backups/desktop-prompt-predict-20261025002212>)，包含安装前的依赖清单、锁文件、workspace 配置与校验记录，不含凭据。需要停止试用时优先在插件页面关闭或移除本插件；不要直接覆盖整份 profile 备份，以免覆盖安装后其他操作。

当前结论：安装和 Host 加载已确认；真实预测质量、GUI、IME、Tab 冲突及多窗口行为待用户试用，不记为已通过。
