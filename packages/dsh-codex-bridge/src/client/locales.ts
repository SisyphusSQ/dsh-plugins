export const en = {
  title: 'Codex Home',
  introduction: 'Read-only import from Codex Home. Skills and Plugins are enabled or disabled as entire categories; plugin skills follow Plugins.',
  home: 'Codex Home directory', enabled: 'Enable Codex Home bridge', instructions: 'Global instructions', skills: 'Standalone Skills', plugins: 'Codex Plugins', agents: 'Custom Agents', connectMcp: 'Authorize MCP connections', executeHooks: 'Authorize local hooks',
  trust: 'MCP servers and hooks may run local programs with DSH process privileges. Import is read-only, but authorized programs are not sandboxed by this bridge. MCP uses the native DSH client; authentication must be configured independently in DSH. Codex credentials are not imported.',
  confirmMcp: 'Authorize the entire imported MCP category? This may start local programs and connect to external servers. Entries with authentication configuration are blocked; configure them independently in DSH.',
  confirmHooks: 'Authorize the entire imported Hooks category? Supported hooks may execute local shell commands.',
  saving: 'Saving…', refused: 'Change was not accepted. The current Host value has been restored.', failed: 'Unable to save. Check the Host connection and retry.', unavailable: 'Settings are unavailable or this connection cannot save Host preferences.', loading: 'Loading Host settings…',
  diagnostics: 'Read-only diagnostics', pending: 'Catalog diagnostics are not available yet.', refresh: 'Refresh diagnostics', loaded: 'Imported catalog',
} as const
export type CopyKey = keyof typeof en
export const zh: Record<CopyKey, string> = {
  title: 'Codex Home',
  introduction: '只读导入 Codex Home。Skills 和 Plugins 均为整类开关；插件自带技能由 Plugins 控制。',
  home: 'Codex Home 目录', enabled: '启用 Codex Home 桥接', instructions: '全局指令', skills: '独立 Skills', plugins: 'Codex Plugins', agents: '自定义 Agents', connectMcp: '授权 MCP 连接', executeHooks: '授权本地 Hooks',
  trust: 'MCP 与 Hooks 可能以 DSH 进程权限执行本地程序。导入器只读，但不会为授权程序提供沙箱。MCP 使用 DSH 原生客户端；鉴权请在 DSH 中独立配置，不导入 Codex 凭据。',
  confirmMcp: '授权整类导入的 MCP？这可能启动本地程序、连接外部服务器。带鉴权配置的条目会被阻止，请在 DSH 中独立配置。',
  confirmHooks: '授权整类导入的 Hooks？受支持的 Hooks 可能执行本地 shell 命令。',
  saving: '正在保存…', refused: '设置未被接受，已恢复当前 Host 值。', failed: '保存失败，请检查 Host 连接后重试。', unavailable: '设置不可用，或此连接不能保存 Host 偏好。', loading: '正在读取 Host 设置…',
  diagnostics: '只读诊断', pending: '尚未取得目录诊断。', refresh: '刷新诊断', loaded: '已导入目录',
}
