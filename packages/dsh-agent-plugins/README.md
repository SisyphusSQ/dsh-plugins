# dsh-agent-plugins

Agent Plugins 1.0.0 适配插件：让 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 直接消费
[Agent Plugins](https://github.com/agentplugins/agent-plugins-spec) 标准插件包（`plugin.json` + `skills/` + `mcp.json`）。

**状态：实验性（M0 骨架）。** 一个 npm 包三合一：host 半（bundle patch）+ client 半（设置面板 tab）+ CLI（`agent-plugins`）。

## 已验证环境

- `@deepseek-ai/dsh@0.1.0-rc.6`（本机 sqmc04，web profile）
- 挂载点：设置 → 插件分区的 `settings.plugins.tab` slot
- 数据通道：host 半 `TypertRemoteService` + `@Remote`；client 半 `connection.rpc.call('/api', 'agentPlugins/<m>', { args })`
- 热重载：launcher 无条件提供 HMR 服务并监听 `$DSH_HOME/cordis.patch.yml`（机制已核实，E2E 见 M3）

## 里程碑状态

| 阶段 | 状态 |
| --- | --- |
| M0 挂载点 + 数据通道 + 热重载机制核实 | ✅ |
| M1 CLI + store + 台账 + manifest/mcp.json 校验 | 计划中 |
| M2 skills provider（含组件级启停） | 计划中 |
| M3 MCP 映射 + patch 同步 + 热重载 E2E | 计划中 |
| M4 护栏 / doctor / 文档 | 计划中 |
| M5 client 面板（列表 + 两级 toggle + MCP 同列） | 计划中 |

设计文档见 [docs/design/dsh-agent-plugins.md](../../docs/design/dsh-agent-plugins.md)。

## 开发

```sh
pnpm install                 # workspace 依赖
pnpm --filter dsh-agent-plugins build     # tsc host 半 + esbuild client 半
```

安装进本机 profile（开发期 file: 链接）：

```sh
dsh plugin --profile web add file:../packages/dsh-agent-plugins
```

隔离 E2E（不碰线上 profile）：

```sh
rm -rf /tmp/dsh-ap-test && mkdir -p /tmp/dsh-ap-test
cp -R ~/.dsh/profiles /tmp/dsh-ap-test/profiles
DSH_HOME=/tmp/dsh-ap-test dsh plugin --profile web add file:/abs/path/packages/dsh-agent-plugins
DSH_HOME=/tmp/dsh-ap-test dsh --profile web --port 3090
```

## 不做的事

不重写 MCP 客户端、不做插件进程沙箱、不实现 sse、不做 extensions 目录、不做 per-tool allow/deny（不接核心审批）、面板不做安装/卸载/更新（CLI 专属）、一期无市场无发现 tab。
