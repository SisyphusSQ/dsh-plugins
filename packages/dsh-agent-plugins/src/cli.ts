/**
 * agent-plugins CLI logic (shared with the host adapter / panel via lib/).
 *
 * The CLI works without a running profile: it only reads/writes the store,
 * installed.json and (in M3) the managed home-patch section. Effect is
 * applied by the adapter's store watch or reconciled at next profile boot.
 */
import { join } from 'node:path'
import { access, readFile, readdir, stat } from 'node:fs/promises'
import {
  DATA_DIRNAME,
  STORE_DIRNAME,
  componentEnabled,
  installFromSource,
  loadLedger,
  resolveDshHome,
  scanStore,
  setMcpEnabled,
  setPluginEnabled,
  setSkillEnabled,
  uninstallPlugin,
  updatePlugin,
  type PluginSource,
  type StorePlugin,
} from './store.js'
import { computeMcpEntries } from './mcp-sync.js'
import { MANAGED_SECTION_END, MANAGED_SECTION_START, managedEntryIds } from './patch-sync.js'

export interface CliOptions {
  storeDir: string
  dataRoot: string
}

export function defaultOptions(): CliOptions {
  const home = resolveDshHome()
  return { storeDir: join(home, STORE_DIRNAME), dataRoot: join(home, DATA_DIRNAME) }
}

const USAGE = `agent-plugins — manage Agent Plugins 1.0.0 packages for DeepSeek Harness

Usage:
  agent-plugins install <dir|zip|git-url>   validate and install into the store
  agent-plugins uninstall <name>            remove from the store (keeps PLUGIN_DATA)
  agent-plugins update [name...|--all]      re-fetch and replace by ledger source
  agent-plugins enable|disable <name>       toggle a plugin
    --skill <name>                          toggle one skill of the plugin
    --mcp <server>                          toggle one MCP server of the plugin
  agent-plugins list [--json]               list installed plugins and component states
  agent-plugins doctor                      check store, ledger and managed patch health

Environment:
  DSH_HOME  overrides the default ~/.dsh home (store at $DSH_HOME/agent-plugins)
`

/** Infer the install source kind from its path/URL. */
export async function inferSource(input: string): Promise<PluginSource> {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) return { kind: 'git', path: input, checksum: '' }
  try {
    const s = await stat(input)
    if (s.isDirectory()) return { kind: 'dir', path: input, checksum: '' }
    if (s.isFile() && input.endsWith('.zip')) return { kind: 'zip', path: input, checksum: '' }
  } catch {
    // fall through: treat as git URL
  }
  return { kind: 'git', path: input, checksum: '' }
}

function flagValue(argv: string[], flag: string): string | undefined {
  const at = argv.indexOf(flag)
  if (at === -1) return undefined
  return argv[at + 1]
}

function warn(issues: { message: string }[]): void {
  for (const issue of issues) {
    if (issue.message.startsWith('unknown top-level field') || issue.message.includes('unsupported;')) {
      console.error(`  警告: ${issue.message}`)
    }
  }
}

async function cmdInstall(argv: string[], opts: CliOptions): Promise<number> {
  const target = argv[0]
  if (target === undefined) {
    console.error(USAGE)
    return 1
  }
  const { ledger } = await loadLedger(opts.storeDir)
  const source = await inferSource(target)
  console.log(`安装 ${target} (${source.kind}) …`)
  const result = await installFromSource(source, opts, ledger)
  if (result.issues.some((issue) => issue.fatal === true)) {
    console.error('安装失败:')
    for (const issue of result.issues) console.error(`  ✗ ${issue.path}: ${issue.message}`)
    return 1
  }
  for (const issue of result.issues) console.error(`  ! ${issue.path}: ${issue.message}`)
  if (result.replaced) {
    console.log(`已替换 ${result.name}@${result.version}（PLUGIN_DATA 保留）${result.downgrade ? '（注意: 版本回退）' : ''}`)
  } else {
    console.log(`已安装 ${result.name}@${result.version}`)
  }
  console.log('生效方式: adapter 运行时自动同步；profile 未运行时下次启动生效')
  return 0
}

async function cmdUninstall(argv: string[], opts: CliOptions): Promise<number> {
  const name = argv[0]
  if (name === undefined) {
    console.error(USAGE)
    return 1
  }
  const { ledger } = await loadLedger(opts.storeDir)
  const result = await uninstallPlugin(opts.storeDir, opts.dataRoot, ledger, name)
  if (!result.ok) {
    console.error(`卸载失败: ${result.issue?.message ?? 'unknown'}`)
    return 1
  }
  console.log(`已卸载 ${name}；PLUGIN_DATA 保留在 ${result.dataDir}`)
  return 0
}

async function cmdUpdate(argv: string[], opts: CliOptions): Promise<number> {
  const { ledger } = await loadLedger(opts.storeDir)
  const names = argv.includes('--all') ? Object.keys(ledger.plugins) : argv
  if (names.length === 0) {
    console.error(USAGE)
    return 1
  }
  let failed = false
  for (const name of names) {
    const result = await updatePlugin(opts.storeDir, opts.dataRoot, ledger, name)
    if (!result.found) {
      console.error(`更新失败: ${result.issues[0]?.message ?? 'not found'}`)
      failed = true
      continue
    }
    if (result.issues.some((issue) => issue.fatal === true)) {
      console.error(`更新失败 ${name}: 校验未通过，保留旧版`)
      for (const issue of result.issues) console.error(`  ✗ ${issue.path}: ${issue.message}`)
      failed = true
      continue
    }
    console.log(`已更新 ${result.name}@${result.version}`)
  }
  return failed ? 1 : 0
}

async function cmdToggle(
  action: 'enable' | 'disable',
  argv: string[],
  opts: CliOptions,
): Promise<number> {
  const name = argv[0]
  if (name === undefined) {
    console.error(USAGE)
    return 1
  }
  const enabled = action === 'enable'
  const { ledger } = await loadLedger(opts.storeDir)
  const skill = flagValue(argv, '--skill')
  const mcp = flagValue(argv, '--mcp')
  if (skill !== undefined && mcp !== undefined) {
    console.error('--skill 与 --mcp 不能同时使用')
    return 1
  }
  let result: { ok: boolean; issue?: { message: string } }
  if (skill !== undefined) result = await setSkillEnabled(opts.storeDir, ledger, name, skill, enabled)
  else if (mcp !== undefined) result = await setMcpEnabled(opts.storeDir, ledger, name, mcp, enabled)
  else result = await setPluginEnabled(opts.storeDir, ledger, name, enabled)
  if (!result.ok) {
    console.error(`${action} 失败: ${result.issue?.message ?? 'unknown'}`)
    return 1
  }
  const what = skill !== undefined ? `技能 ${skill}` : mcp !== undefined ? `MCP ${mcp}` : `插件 ${name}`
  console.log(`已${action} ${what}`)
  console.log('增量同步由运行中的 adapter 执行（技能 invalidate / MCP 行热重载）；profile 未运行时下次启动生效')
  return 0
}

async function cmdList(argv: string[], opts: CliOptions): Promise<number> {
  const asJson = argv.includes('--json')
  const { ledger } = await loadLedger(opts.storeDir)
  const plugins = await scanStore(opts.storeDir)
  // Merge ledger state with scanned directories (scan is authoritative for existence).
  const rows = plugins.map((plugin) => ({ plugin, row: ledger.plugins[plugin.name] }))
  for (const name of Object.keys(ledger.plugins)) {
    if (!rows.some((r) => r.plugin.name === name)) {
      console.error(`  ! 台账中有 "${name}" 但 store 中无对应目录（可 doctor 检查）`)
    }
  }
  if (asJson) {
    console.log(JSON.stringify(rows.map(({ plugin, row }) => ({
      name: plugin.name,
      version: plugin.version,
      enabled: row?.enabled ?? true,
      skills: row === undefined ? {} : Object.fromEntries(Object.entries(row.skills).map(([k, v]) => [k, { enabled: v.enabled }])),
      mcp: row === undefined ? {} : Object.fromEntries(Object.entries(row.mcp).map(([k, v]) => [k, { enabled: v.enabled }])),
    })), null, 2))
    return 0
  }
  if (rows.length === 0) {
    console.log('（未安装任何插件）')
    console.log('提示: agent-plugins install <dir|zip|git-url>')
    return 0
  }
  for (const { plugin, row } of rows) {
    const enabled = row?.enabled ?? true
    console.log(`${plugin.name}@${plugin.version}  ${enabled ? '启用' : '禁用'}  来源: ${row?.source.kind ?? '?（未在台账）'}`)
    if (row !== undefined) {
      const r = row
      for (const skill of plugin.skills) {
        const on = componentEnabled(r, 'skills', skill)
        console.log(`  └ 技能 ${skill} ${on ? '✓' : '✗'}`)
      }
      for (const server of plugin.mcpServers) {
        const state = r.mcp[server]
        console.log(`  └ MCP ${server} ${componentEnabled(r, 'mcp', server) ? '✓' : '✗'}${state === undefined ? '（默认开）' : `（台账状态 ${state.enabled ? '开' : '关'}）`}`)
      }
    }
  }
  return 0
}


async function cmdDoctor(opts: CliOptions): Promise<number> {
  let problems = 0
  const storeExists = await access(opts.storeDir).then(() => true, () => false)
  if (!storeExists) {
    console.log(`store 目录不存在: ${opts.storeDir}（全新环境，正常）`)
    return 0
  }
  const { ledger, issue } = await loadLedger(opts.storeDir)
  if (issue !== undefined) {
    console.error(`✗ ${issue.message}`)
    problems++
  }
  const plugins = await scanStore(opts.storeDir)
  for (const name of Object.keys(ledger.plugins)) {
    if (!plugins.some((p) => p.name === name)) {
      console.error(`✗ 台账中的 "${name}" 在 store 中无对应目录`)
      problems++
    }
  }
  for (const plugin of plugins) {
    const row = ledger.plugins[plugin.name]
    if (row === undefined) {
      console.error(`✗ store 中的 "${plugin.name}@${plugin.version}" 不在台账（孤儿目录，可卸载清理）`)
      problems++
    }
    for (const issue of plugin.issues) {
      if (issue.fatal === true) {
        console.error(`✗ ${plugin.name}: ${issue.message}`)
        problems++
      }
    }
  }

  // MCP managed patch health: marker integrity + ledger/patch consistency.
  const patchFile = join(resolveDshHome(), 'cordis.patch.yml')
  const patchText = await readFile(patchFile, 'utf8').catch(() => undefined)
  if (patchText !== undefined) {
    const hasStart = patchText.includes(MANAGED_SECTION_START)
    const hasEnd = patchText.includes(MANAGED_SECTION_END)
    if (hasStart && !hasEnd) {
      console.error(`✗ 保留段损坏：${patchFile} 有开始标记但缺结束标记（可能影响启动）`)
      problems++
    } else if (hasStart && hasEnd) {
      const warns: string[] = []
      const expected = await computeMcpEntries({
        storeDirs: [opts.storeDir],
        dataRoot: opts.dataRoot,
        managedPatch: patchFile,
        readLedger: () => ledger,
        warn: (m) => warns.push(m),
      })
      const actualIds = await managedEntryIds(patchFile)
      const expectedIds = expected.map((entry) => entry.id)
      const missing = expectedIds.filter((id) => !actualIds.includes(id))
      const extra = actualIds.filter((id) => !expectedIds.includes(id))
      if (missing.length > 0 || extra.length > 0) {
        console.warn(`! 保留段与台账不一致（缺失 ${missing.length} 行、多余 ${extra.length} 行）；运行中的 adapter 会自动同步，未运行时下次启动对账`)
      }
    }
  }
  if (problems === 0) console.log('✓ store 与台账健康')
  console.log(`store: ${opts.storeDir}`)
  return problems === 0 ? 0 : 1
}

/** CLI entry; returns the process exit code. */
export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  const opts = defaultOptions()
  if (command === undefined || rest.includes('--help') || rest.includes('-h')) {
    console.log(USAGE)
    return command === undefined ? 1 : 0
  }
  switch (command) {
    case 'install': return await cmdInstall(rest, opts)
    case 'uninstall': return await cmdUninstall(rest, opts)
    case 'update': return await cmdUpdate(rest, opts)
    case 'enable':
    case 'disable': return await cmdToggle(command, rest, opts)
    case 'list': return await cmdList(rest, opts)
    case 'doctor': return await cmdDoctor(opts)
    default:
      console.error(`未知命令: ${command}`)
      console.log(USAGE)
      return 1
  }
}
