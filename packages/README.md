# Packages

This directory contains independently installable DeepSeek Harness plugin packages. Packages remain experimental until their README records a completed DSH profile verification.

## 当前包

| 包 | 状态 | 能力 | DSH 目标版本 |
| --- | --- | --- | --- |
| [`dsh-agent-plugins`](dsh-agent-plugins/README.md) | 实验中，待真实 profile 验收 | Agent Plugins 标准包适配、CLI、host/client 面板 | `0.1.0-rc.6` |
| [`dsh-composer-skill-mention`](dsh-composer-skill-mention/README.md) | 实验中，未发布 | DSH Web composer 的 `$` / `￥` Skill 提及 | `0.1.0-rc.6` |
| [`dsh-session-tools`](dsh-session-tools/README.md) | 实验中，未发布 | 会话列表、快照读取、创建、重命名、Fork、跨会话 relay | `0.1.0-rc.6` |
| [`dsh-thinking-collapse`](dsh-thinking-collapse/README.md) | 实验中，已完成隔离 profile 验收 | 聊天视图的 Codex 式思考与工具调用折叠 | `0.1.0-rc.6` |
| [`dsh-git-worktree`](dsh-git-worktree/README.md) | 实验中，未发布 | Git worktree host 命令、模型工具与 CLI | `0.1.0-rc.6` |
| [`dsh-git-worktree-web`](dsh-git-worktree-web/README.md) | 实验中，未发布 | DSH Web 命令弹层与 Workspace 切换 companion | `0.1.0-rc.6` |

## 新增包的条件

只有在具体插件范围、运行时边界和验证入口已经讨论清楚后，才在本目录新增包。每个正式包至少需要：

```text
packages/dsh-example/
├── src/
├── test/ or tests/
├── README.md
├── package.json
└── cordis.patch.yml     # 仅声明 dsh.bundle 的 host 包需要
```

同时满足以下约定：

- 一个包对应一个可独立安装的能力；
- 包名以 `dsh-` 开头，不使用中文路径；
- `package.json` 只声明实际存在且可以加载的入口；
- 只有真实 profile bundle 才声明 `dsh.bundle`，并在其中提供 `patch` 字段；
- README 记录已验证的 DSH 版本、安装方式、配置、卸载方式和验证边界；
- 聚合包只依赖已经稳定发布的独立包，不包含实验性能力；
- 共享包只在出现可证明的重复实现后创建。

需要修改 DSH 核心才能运行的探索内容，应先单独讨论其归属，不直接放进正式插件目录。
