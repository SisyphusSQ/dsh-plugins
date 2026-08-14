# dsh-agent-plugins 设计

> 仓库内设计文档。需求来源：[agent-memory/ideas/agent-plugins-dsh-adapter.md](../../../Documents/agent-memory/ideas/agent-plugins-dsh-adapter.md)
> 适用环境：`@deepseek-ai/dsh@0.1.0-rc.6`（本机 sqmc04，web profile）
> 更新：2026-08-14（M0 完成后）

## 目标

让 DSH 消费 [Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec) 标准插件包（`plugin.json` + `skills/` + `mcp.json`），纯 Cordis 适配插件，不改内核。

包形态：**一个 npm 包三合一**——`dsh.bundle.patch`（host 半）+ `exports["./client"]`（面板 client 半）+ `bin.agent-plugins`（CLI）。

## M0 结论（2026-08-14 源码级核实 + E2E 实测）

### 0. M0 E2E 实测结果（隔离实例 DSH_HOME=/tmp/dsh-ap-test，端口 3090）

| 验证项 | 结果 |
| --- | --- |
| host 半激活 + RPC 通道 | ✅ `POST /api/agentPlugins/ping` 返回 `{ok:true, service:"agentPlugins", version:"0.1.0"}` |
| client 半打包进 boot graph | ✅ `/plugins/dsh-agent-plugins/client.js` 200，`__ModuleLoader__.load` 格式 |
| `dsh plugin --profile web add file:` | ✅ 自动 reconcile 进 `dsh.profile.bundles` |
| 组合树 | ✅ `--dump-config` 含 `agent-plugins` 行 |
| patch 热重载（增/删/坏行） | ✅ 见 §3 表 |
| 挂载点 | 源码 + 实时 slot 树确认；面板可见性待浏览器人工验收 |

### 1. 挂载点：`settings.plugins.tab`（已确认）

实时 Slot 树与源码双重确认：`dsh-client-ui-settings-plugins` 声明根级 list slot `settings.plugins.tab`（"One page inside the Plugins settings section"），注册契约 `{id: string(必填), order?: number, label?: string | (() => string)}`。

client 半注册范式（与官方 `configurable` tab 相同）：

```ts
ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
  name: 'settings.plugins.tab',
  id: 'agent-plugins',
  order: 20,
  label: () => t('label'),
  locale: NS,
  inject: () => ({ ...face }),
}, PanelComponent))
```

### 2. 数据通道：typert Gateway `@Remote`（已确认，无需改内核）

| 候选通道 | 第三方可用性 | 结论 |
| --- | --- | --- |
| `apiProxy` 统一 API 域 | ✗ 内核白名单（"New client-request domain = one new file pair + one map row"） | 排除 |
| typert 类型化 Remote 组装（`dsh-api-remotes`） | ✗ client 侧组装封闭（静态 bundle 5 个官方命名空间） | 排除 |
| **typert Gateway SRC 反射** | ✅ `typertGateway.collectSrcClaims()` 遍历 `ctx.reflect.props` 所有活服务，凡带 `typertRemote` binding 者自动暴露 `/api/<ns>/<method>`；SRC 描述符按方法参数名反推 wire 字段，**无需跑 typert-generator** | **采用** |
| settings 命名空间 | ✗ api-proxy 白名单（第三方命名空间得 `settings-not-exposed`） | 排除 |
| 动态插件 `host.call` | ✗ 仅动态包（绑定 pluginId） | 排除 |
| `webServer.register` HTTP 路由 | ✅ 开放，无全局围栏（围栏只在 /api 基座） | 备选 |

Host 半（参考 `dsh-goal` 模式）：

```ts
export default class AgentPluginsService extends TypertRemoteService<never> {
  constructor(ctx: Context) { super(ctx, 'agentPlugins') } // serviceKey=命名空间
  @Remote('list') async list(): Promise<PanelData> { ... }
}
```

Client 半：

```ts
const { rpc } = ctx.get('connection')
rpc.call('/api', 'agentPlugins/list', { args: {} }, signal) // payload 必须恰好 {args:{...}} 一个字段
```

要点：
- payload 校验：`{args: {...}}` 且仅此一个字段（host `dispatchRpc`）。
- 参数按**名称**匹配 wire（src-json）；方法末参可命名 `signal` 作取消信号。
- 参数名不要撞 typert lookup 定义（`agent`/`sessionId` 等有 lookup provider 的名会被注入改写）；面板 API 用普通 JSON 参数名。
- 端点：`<namespace>/<method>`，namespace 默认 = serviceKey（`agentPlugins`）。

### 3. patch 热重载（机制已确认，E2E 已实测 ✅）

launcher（`dsh/lib/profile-boot-*.js`）boot 后：
1. 无条件创建 `@deepseek-ai/cordis-plugin-hmr`（`config: {root: []}`——只做 config 级监听，**不做插件级 HMR**，与需求文档风险 3 一致）；
2. 对两个文件调 `watchUserPatches`：profile 的 `cordis.patch.yml` + `$DSH_HOME/cordis.patch.yml`；
3. `hmr.registerConfig`（chokidar 精确监听 add/change/unlink）→ `entry.update()` 热替换根 Include 的 patches。

**E2E 实测（2026-08-14，隔离实例 3090）**：

| 场景 | 结果 |
| --- | --- |
| 运行中向 home patch 写入 insert 行（真实包） | ✅ entry 热创建并激活（`pluginInventory/list` 可见 `fiberPhase: active`） |
| 删除 home patch 文件 | ✅ 对应 entry 热移除，实例继续服务 |
| 运行中写入坏行（包不存在） | ✅ 实例不崩（entry 静默 failed，无日志） |
| **boot 时** home patch 含坏行 | ❌ **fail loud，整个 profile 起不来**（`Cannot find package`）——坐实"文件坏 = 启动失败"语义 |
| client-modules boot graph rev | 按**包名**去重（两个 entry 同名包只留一份），rev 不变是正常行为，不是热重载失效 |

**硬性要求（文档补充）**：`loadOptionalPatches` 对 home patch 是"文件坏 → boot fail loud"，且整个文件按单个 YAML 数组解析。因此 patch-sync 必须：
- 保留段内只增删自己的行，文件始终是合法 YAML 顶层数组；
- **原子写（tmp + rename）**，避免热重载窗口期的半截文件让 profile 起不来；
- 写入的 MCP 行引用的 `dsh-mcp-client` 包必须存在于 profile（官方包，必然成立）。

### 4. 顺带发现的上游缺陷（待提 PR）

`cordis_inspect_query` 的 client 平台查询，当页面返回**错误应答**（如查目录外服务名 → `queryServiceApi` throw → 页面回 `{ok:false, reason:"provider-error"}`）时，host 侧 `dsh-cordis-host-runner` 的 `resolveClientQuery` 对 `!resolution.ok` 直接 `return {accepted:false}`（丢弃），查询永远留在 pending 表 → 表现为"卡住"直到工具超时取消。host 平台查询是本地执行，异常直接作为工具错误返回，无此问题（行为不对称）。修复方向：`resolveClientQuery` 应接受错误 resolution 并 settle 给工具。影响：client 侧只能查目录内服务契约（目录外服务名会挂起而非报错）。

### 5. client 半构建（官方格式确认）

- 包必须**预构建** client 半为 `window.__ModuleLoader__.load({id, factory: (require) => { ...; return module.exports }})`（Node 半 `dsh-client-modules` 只哈希/托管已构建产物，缺失时报 "run `pnpm run build`"）。
- factory 内依赖全部 external 化（`require("react")`、`require("@deepseek-ai/dsh-client-runtime/client")` 等），运行期由 loader 的模块表提供；`<id>/client` 与裸 id 解析到同一 exports。
- host 半统一 `"type": "module"` ESM，`main: lib/index.js`，插件即默认导出类（`extends Service` / `TypertRemoteService`）。
- client 侧服务提供者：`connection`（dsh-client-connection）、`locale`（dsh-client-locale）、`slots`（slot 系统，dsh-client-ui-slots 提供类型与组件）。

## 包结构

```
packages/dsh-agent-plugins/
├── package.json           # ESM；dsh.bundle.patch → cordis.patch.yml；exports["./client"]；bin.agent-plugins
├── cordis.patch.yml       # - insert: [{ id: agent-plugins, name: dsh-agent-plugins }]
├── tsconfig.json          # NodeNext ESM + 标准装饰器（非 experimental）
├── scripts/build-client.mjs  # esbuild 打包 client 半 → window.__ModuleLoader__.load 格式
├── src/
│   ├── index.ts           # host 插件主体：AgentPluginsService extends TypertRemoteService
│   ├── manifest.ts        # plugin.json 校验（纯函数，可单测）        [M1]
│   ├── mcp-map.ts         # mcp.json → dsh-mcp-client config 映射（纯函数）[M1]
│   ├── skill-provider.ts  # skills.registerProvider 包装             [M2]
│   ├── patch-sync.ts      # home patch 保留段生成/清理 + 原子写        [M3]
│   └── store.ts           # store 扫描、watch、installed.json 台账     [M1]
│   └── client/
│       └── index.tsx      # 面板：settings.plugins.tab tab             [M0 骨架 / M5 完整]
├── bin/agent-plugins.js   # CLI（薄壳：参数解析 + 调 lib/store.js）    [M1]
└── test/                  # 规范 fixtures（plugin + mcp 两套 schema）  [M1]
```

## 配置面

```yaml
# profile cordis.patch.yml（用户层，唯一静态改动）
- id: agent-plugins
  name: dsh-agent-plugins
  config:
    stores: [./agent-plugins, ~/.dsh/agent-plugins]
    managedPatch: ~/.dsh/cordis.patch.yml
    mcpEnabled: true
    skillsEnabled: true
    trustedStores: true
    syncOnChange: true
```

## 里程碑与验收（M1–M5 沿用需求文档，此处只记录 M0 增量）

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| M0 ✅ | 挂载点 + 数据通道 + 热重载机制核实（本文档） | 见上 |
| M1 | 包骨架 + CLI + store + 两级台账 + manifest/mcp.json 校验 | 规范 fixture 全过 |
| M2 | skills provider（含组件级启停过滤） | 技能在 web 可发现可加载；单技能启停即时生效 |
| M3 | MCP 映射 + patch-sync 保留段 + 热重载 E2E | 工具注册/重连/卸载全通；单 server 启停即时 |
| M4 | 护栏、日志、doctor、README | 符合性清单（规范 Appendix A 为底稿） |
| M5 | client 面板（列表 + 两级 toggle + MCP 同列 + CLI 提示） | 面板可看可启停；级联置灰正确 |

## 不做的事（护栏，实现时保留注释）

不重写 MCP 客户端、不做插件进程沙箱、不实现 sse transport、不处理 extensions 扩展目录、不做 per-tool allow/deny（不接核心审批）、面板不做安装/卸载/更新（CLI 专属）、不做发现 tab（一期无市场）。组件级启停只到 skill / MCP server 粒度。

## 兼容性与验证边界（AGENTS.md 要求）

- 已验证 DSH 版本：`@deepseek-ai/dsh@0.1.0-rc.6`。
- M1 fixture 单测 ≠ 真实 E2E；M2/M3 的"技能可发现 / 工具注册"验收在本机 profile 实测，两者分开描述。
- 隔离测试环境：`DSH_HOME=/tmp/dsh-ap-test` + 复制 profiles（24M）+ `dsh --profile web --port 3090`，不影响线上 web profile 与本会话。
