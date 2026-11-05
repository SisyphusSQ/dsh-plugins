# Codex Home 兼容桥

[English](<README.md>)

只读导入 Codex Home 中的配置，为 DeepSeek Harness 提供兼容能力。不读取凭据库、不复制会话或状态数据库，不写入 Codex Home，也不运行 Codex CLI。MCP 连接使用 DSH 原生客户端；鉴权在 DSH 中独立配置。

## 设置

兼容桥默认关闭。设置页提供 Home 路径（默认 `CODEX_HOME` 或 `~/.codex`）及整类开关：

- 全局指令：首个非空的 `AGENTS.override.md` 或 `AGENTS.md`，遵守配置的字节预算。
- Skills：Home 中的独立技能。
- Plugins：明确启用、缓存版本选择无歧义的插件，包含其技能。
- Agents：Home TOML 角色及配置引用的 Home 内角色文件。
- MCP 连接、hooks 执行：独立授权，均默认关闭；在设置页开启时需确认。

没有逐技能或逐插件开关。插件技能跟随 Plugins，而非 Skills。设置使用 DSH 原生持久化配置表单。页面按桥接与目录、导入内容、执行授权、只读诊断分组，并沿用 Host 主题变量。目录通过「保存目录」或 Enter 显式保存；开关与目录值以 Host 确认为准，加载、只读、保存中和失败状态保持可见。诊断区分未读取、读取中、失败和就绪快照，展示数量、扫描时间与可展开详情；数量不表示连接健康或执行成功。诊断不包含指令正文、命令、环境变量值或请求头。

## 运行能力

技能保留调用策略及目录资源，使用稳定的 DSH 名称并保留原始标识映射。已知的命名空间技能引用在内存中转换。全局指令的版本更新和撤销依据已接纳的可见会话消息去重。

`codex_home_catalog` 提供角色策略兼容状态、技能映射和安全诊断。`codex_agent` 使用父 Agent 的组合，真正委派一次性 DSH 子 Agent。只读目录查询仅要求工具服务，不依赖模型或子 Agent 服务。委派需要存活的父 Agent、llm/subagents 服务，以及已注册的 `spawn` provider 和具体 Agent 实现；仅有注册表接口不能执行子 Agent。模型覆盖需要已有 DSH provider 路由。每次委派只读取一次当前 DSH `subagents.maxDepth`，在模型查询前检查，并把同一上限传给启动请求；零值禁止子委派。新运行参数不能降低父会话已持久化的深度。不等价的角色策略或配置会在启动前拒绝。分类变化取消所属任务，卸载时中止并等待清理。

已授权且不带鉴权配置的 MCP 使用公开 DSH MCP 客户端，支持 stdio 和 Streamable HTTP、稳定命名空间、插件根路径替换及工具超时。包含鉴权、Header 或显式环境变量配置的条目会在连接前被阻止，并提示在 DSH 中独立配置。不读取 Codex OAuth 授权，不解析凭据引用或鉴权 helper。独立配置的鉴权归 DSH 管理；关闭导入分类只关闭桥接拥有的连接并撤回相应工具。授权的同步命令 hooks 使用 DSH shell 和 hook protocol，适配 SessionStart、UserPromptSubmit、PreToolUse、PostToolUse 和 Stop。不执行不支持的配置。hook 授权撤销会阻止新 hook 任务并丢弃已撤销的 hook 输出；生命周期轮询取消待完成 hooks。

可执行组件属于受信任的本地程序，拥有 DSH 进程权限。只读导入不等于执行沙箱；本插件不提供 Codex 模型登录认证，也不覆盖 DSH 权限。

## 验证

编译与无凭据回归目标为 DSH **0.2.2-rc.1** API、Cordis **4.1.0**，Node 要求 **24.9.0 或更新**。Host 组合负责选择可用工具 executor；兼容桥只贡献工具定义，不替宿主选择 executor。hooks 通过 Agent 注册表持有的 turn-boundary handle 读取回合位置。`@deepseek-ai/dsh-hook-protocol` 作为运行时依赖随包分发。构建入口测试覆盖解析、整类开关、设置写入、资源所有权竞争、协议格式及真实 Gateway 发现。macOS 夹具使用目标 shell/subprocess provider 验证 hook 父、子进程取消。原生 MCP 测试覆盖目标 stdio/HTTP 传输及 Loader 桥接入口与环回假服务，固定审阅后的 schema/wire/result 快照；验证假 Codex grant 被忽略、含鉴权配置的导入不连接，以及独立鉴权的 DSH 原生连接不受桥接卸载影响。深度回归覆盖零上限、用尽与超过上限、合法边界启动、运行期配置变化，以及模型查询前后共用一次捕获值。Loader 组合挂载真实异步 session-projection 注册表、Agent 注册表、native tool executor 和子 Agent 服务，使用目标 batch dispatch API 检查结果关联、授权撤销、卸载及服务重新挂载。默认执行的 native-role 场景进一步使用已显式声明的精确 0.2.2-rc.1 Agent loop、in-process spawn provider 与同一 scope 模块实例，配合脚本模型，检查模型选择后的父 Agent 完整回合、实际组装的 Home/角色指令、作用域工具拒绝且不串扰其他 Agent、深度拒绝、子会话深度继承、结果交付及卸载取消。这些属于无凭据组合验证，不是真实服务商或产品入口 E2E。

已打包的 Host 产物还在全新 DSH 0.2.2-rc.1 CLI/Headless 进程中，以脚本模型、测试专用 Home 和原生父子委派完成验证：核对目录/结果记录与最终完成事件，Home 夹具保持不变。tarball 使用链接的目标依赖；这是产品入口 Headless 证据，不是包管理器 profile 安装或真实服务商 E2E。此前日常 Desktop 的目录调用、指令、开关与技能加载证据仍属历史。本次未安装或重启日常 profile，未执行 GUI 视觉验收。

语义边界与待验证范围见[兼容和验证记录](<lib/compatibility.md>)。
