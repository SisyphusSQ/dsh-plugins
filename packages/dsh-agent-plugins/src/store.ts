/**
 * Agent-plugins store: directory layout, ledger, install/uninstall/update,
 * symlink-aware containment (spec §4.1).
 *
 * Layout (machine-level store; project-level stores share the same shape):
 *   <storeDir>/                 e.g. $DSH_HOME/agent-plugins
 *     <name>@<version>/         one directory per plugin
 *       plugin.json
 *       skills/<name>/SKILL.md
 *       mcp.json
 *     installed.json            ledger (two-level enable state)
 *   <dataRoot>/<name>/          PLUGIN_DATA (kept across updates/uninstalls)
 *
 * Every mutation writes the ledger atomically (tmp + rename). The store is
 * the single source of truth shared by the CLI, the host adapter and the
 * panel (M5) — panel toggles call the same functions as `enable/disable`.
 */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parseMcpManifest, parsePluginManifest, type ManifestIssue, type PluginManifest } from './manifest.js'
import { validateCommand } from './mcp-map.js'

const execFileAsync = promisify(execFile)

/** Default machine-level store directory name under $DSH_HOME. */
export const STORE_DIRNAME = 'agent-plugins'
/** Default PLUGIN_DATA root directory name under $DSH_HOME. */
export const DATA_DIRNAME = 'agent-plugins-data'
/** Ledger filename inside the store. */
export const LEDGER_FILENAME = 'installed.json'

/** One plugin's recorded source (how `update` re-fetches it). */
export interface PluginSource {
  kind: 'dir' | 'zip' | 'git'
  /** Recorded source path/URL at install time. */
  path: string
  /** Content checksum computed at install/update time. */
  checksum: string
}

/** Component-level enable state (skill or MCP server). */
export interface ComponentState {
  enabled: boolean
}

/** One ledger row: plugin-level state plus component-level states. */
export interface LedgerPlugin {
  name: string
  version: string
  source: PluginSource
  installedAt: string
  /** Plugin-level enable state (default true). */
  enabled: boolean
  /** Component-level states; absent key = enabled. */
  skills: Record<string, ComponentState>
  mcp: Record<string, ComponentState>
}

/** installed.json document. */
export interface Ledger {
  version: 1
  plugins: Record<string, LedgerPlugin>
}

/** A validated plugin directory inside the store. */
export interface StorePlugin {
  name: string
  version: string
  dir: string
  manifest: PluginManifest
  /** Skill directory names with a valid SKILL.md. */
  skills: string[]
  /** MCP server names declared by mcp.json (when valid). */
  mcpServers: string[]
  issues: ManifestIssue[]
}

/** Result of an install/update operation. */
export interface InstallResult {
  name: string
  version: string
  replaced: boolean
  /** True when the installed version is older than the replaced one. */
  downgrade: boolean
  issues: ManifestIssue[]
}

export const EMPTY_LEDGER: Ledger = { version: 1, plugins: {} }

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

/** Read the ledger; a missing or corrupt ledger yields a fresh empty one plus an issue. */
export async function loadLedger(storeDir: string): Promise<{ ledger: Ledger; issue?: ManifestIssue }> {
  const file = join(storeDir, LEDGER_FILENAME)
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as unknown
    if (typeof raw !== 'object' || raw === null) {
      return { ledger: EMPTY_LEDGER, issue: { path: LEDGER_FILENAME, message: 'malformed ledger; starting empty' } }
    }
    const asLedger = raw as Partial<Ledger>
    if (asLedger.version !== 1 || typeof asLedger.plugins !== 'object' || asLedger.plugins === null) {
      return { ledger: EMPTY_LEDGER, issue: { path: LEDGER_FILENAME, message: 'malformed ledger; starting empty' } }
    }
    return { ledger: asLedger as Ledger }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ledger: EMPTY_LEDGER }
    return { ledger: EMPTY_LEDGER, issue: { path: LEDGER_FILENAME, message: `unreadable ledger: ${String(error)}` } }
  }
}

/** Write the ledger atomically (tmp + rename). */
export async function saveLedger(storeDir: string, ledger: Ledger): Promise<void> {
  await mkdir(storeDir, { recursive: true })
  const file = join(storeDir, LEDGER_FILENAME)
  const tmp = `${file}.tmp-${process.pid}`
  await writeFile(tmp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')
  await rename(tmp, file)
}

// ---------------------------------------------------------------------------
// Directory layout
// ---------------------------------------------------------------------------

/** Parse a `<name>@<version>` store directory name; null when it does not match. */
export function parseStoreDirName(dirName: string): { name: string; version: string } | null {
  const at = dirName.lastIndexOf('@')
  if (at <= 0 || at === dirName.length - 1) return null
  const name = dirName.slice(0, at)
  const version = dirName.slice(at + 1)
  if (name.length === 0 || version.length === 0) return null
  if (name.includes('@') || name.includes(sep)) return null
  return { name, version }
}

/** Scan the store for plugin directories (name@version). */
export async function scanStore(storeDir: string): Promise<StorePlugin[]> {
  let entries: string[]
  try {
    entries = await readdir(storeDir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const plugins: StorePlugin[] = []
  for (const entry of entries) {
    const parsed = parseStoreDirName(entry)
    if (parsed === null) continue
    const dir = join(storeDir, entry)
    let stat
    try {
      stat = await lstat(dir)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue
    const verified = await verifyPluginDir(dir)
    if (verified.manifest !== undefined) {
      plugins.push({
        name: verified.manifest.name,
        version: parsed.version,
        dir,
        manifest: verified.manifest,
        skills: verified.skills,
        mcpServers: (verified.mcpServers ?? []).map((server) => server.name),
        issues: verified.issues,
      })
    }
  }
  return plugins
}

// ---------------------------------------------------------------------------
// Verification (spec §4.1, §5, §7.2.1)
// ---------------------------------------------------------------------------

export interface VerifiedPlugin {
  manifest?: PluginManifest
  mcpServers?: ReturnType<typeof parseMcpManifest>['value']
  /** Valid skill directory names (SKILL.md present, containment ok). */
  skills: string[]
  issues: ManifestIssue[]
}

/**
 * Verify one plugin directory: plugin.json + optional mcp.json validation and
 * symlink-aware path containment.
 *
 * Failure boundaries: plugin.json fatal issues reject the whole plugin;
 * component-level issues (bad skill dir, escaping MCP command/cwd) reject
 * only that component.
 */
export async function verifyPluginDir(dir: string): Promise<VerifiedPlugin> {
  const issues: ManifestIssue[] = []
  const rootReal = await realpath(dir)

  // plugin.json must exist and be valid, or the whole plugin is rejected.
  let pluginText: string
  try {
    pluginText = await readFile(join(dir, 'plugin.json'), 'utf8')
  } catch (error) {
    return { issues: [{ path: join(dir, 'plugin.json'), message: `missing plugin.json: ${String(error)}`, fatal: true }], skills: [] }
  }
  const pluginResult = parsePluginManifest(pluginText)
  issues.push(...pluginResult.issues)
  if (!pluginResult.ok || pluginResult.value === undefined) {
    return { issues, skills: [] }
  }
  const manifest = pluginResult.value

  // plugin.json itself must not be a symlink escaping the root.
  const pluginJsonReal = await safeRealpath(join(dir, 'plugin.json'))
  if (pluginJsonReal !== null && !isWithin(rootReal, pluginJsonReal)) {
    return { issues: [...issues, { path: 'plugin.json', message: 'plugin.json resolves outside the plugin root', fatal: true }], skills: [] }
  }

  // skills/: every direct child with SKILL.md is a candidate; a child whose
  // resolved path escapes the root is invalid (skip that skill).
  const skillsDir = join(dir, 'skills')
  const skills: string[] = []
  try {
    for (const entry of await readdir(skillsDir)) {
      const skillDir = join(skillsDir, entry)
      let stat
      try {
        stat = await lstat(skillDir)
      } catch {
        continue
      }
      if (!stat.isDirectory()) continue
      const skillFile = join(skillDir, 'SKILL.md')
      try {
        const skillReal = await safeRealpath(skillFile)
        if (skillReal === null) continue
        if (!isWithin(rootReal, skillReal)) {
          issues.push({ path: relative(dir, skillFile), message: `skill "${entry}" resolves outside the plugin root; skipped` })
          continue
        }
        skills.push(entry)
      } catch {
        continue
      }
    }
  } catch {
    // no skills/ directory: fine
  }

  // mcp.json: optional; validated independently (a bad MCP half never fails
  // the plugin or its skills).
  let mcpServers: ReturnType<typeof parseMcpManifest>['value']
  let mcpText: string | undefined
  try {
    mcpText = await readFile(join(dir, 'mcp.json'), 'utf8')
  } catch {
    mcpText = undefined
  }
  if (mcpText !== undefined) {
    const mcpResult = parseMcpManifest(mcpText)
    issues.push(...mcpResult.issues)
    if (mcpResult.ok) {
      mcpServers = mcpResult.value
      // command/cwd containment at symlink level: resolve and realpath.
      if (mcpServers !== undefined) {
        for (const server of mcpServers) {
          if (server.type === 'stdio' && server.command !== undefined) {
            const checked = validateCommand(server.command, {
              pluginName: manifest.name,
              pluginRoot: rootReal,
              pluginDataDir: join(dirname(dir), DATA_DIRNAME, manifest.name),
            })
            if (typeof checked === 'object') {
              issues.push({ path: `mcp.json#/mcpServers/${server.name}/command`, message: checked.error })
            } else if (checked.startsWith('./') || isAbsolutePath(checked)) {
              const resolved = await safeRealpath(checked)
              if (resolved !== null && !isWithin(rootReal, resolved)) {
                issues.push({ path: `mcp.json#/mcpServers/${server.name}/command`, message: `command resolves outside the plugin root; server invalid` })
              }
            }
          }
        }
      }
    }
  }

  return { manifest, mcpServers, skills, issues }
}

function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)
}

async function safeRealpath(p: string): Promise<string | null> {
  try {
    return await realpath(p)
  } catch {
    return null
  }
}

/** Is `target` strictly inside `root`? */
export function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(sep) && !isAbsolutePath(rel)
}

// ---------------------------------------------------------------------------
// Checksum
// ---------------------------------------------------------------------------

/** sha256 over the plugin directory's file paths + contents (stable order). */
export async function checksumDir(dir: string): Promise<string> {
  const hash = createHash('sha256')
  const walk = async (base: string): Promise<void> => {
    const entries = (await readdir(base, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const full = join(base, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        hash.update(relative(dir, full))
        hash.update(await readFile(full))
      } else if (entry.isSymbolicLink()) {
        hash.update(relative(dir, full))
        hash.update('->')
        hash.update(await realpath(full))
      }
    }
  }
  await walk(dir)
  return hash.digest('hex')
}

// ---------------------------------------------------------------------------
// Install / update / uninstall
// ---------------------------------------------------------------------------

/** Copy a source directory into the store under `<name>@<version>`. */
async function stageSource(source: PluginSource, stagingRoot: string): Promise<{ staged: string; cleanup: () => Promise<void> }> {
  await mkdir(stagingRoot, { recursive: true })
  const staged = join(stagingRoot, `stage-${process.pid}-${Date.now()}`)
  if (source.kind === 'dir') {
    await cp(source.path, staged, { recursive: true })
    return { staged, cleanup: () => rm(staged, { recursive: true, force: true }) }
  }
  if (source.kind === 'zip') {
    await execFileAsync('unzip', ['-q', source.path, '-d', staged])
    return { staged, cleanup: () => rm(staged, { recursive: true, force: true }) }
  }
  // git
  await execFileAsync('git', ['clone', '--depth', '1', source.path, staged])
  return { staged, cleanup: () => rm(staged, { recursive: true, force: true }) }
}

/**
 * Install from a source: verify first, then move into the store under
 * `<name>@<version>`. Same-name installs replace the old version
 * (PLUGIN_DATA is preserved).
 */
export async function installFromSource(
  source: PluginSource,
  opts: { storeDir: string; dataRoot: string },
  ledger: Ledger,
): Promise<InstallResult> {
  const { storeDir, dataRoot } = opts
  const { staged, cleanup } = await stageSource(source, join(storeDir, '.staging'))
  try {
    // Validate the staged copy (containment included) before it enters the store.
    const verified = await verifyPluginDir(staged)
    const fatal = verified.issues.some((issue) => issue.fatal === true)
    const manifest = verified.manifest
    if (fatal || manifest === undefined) {
      return { name: manifest?.name ?? 'unknown', version: 'unknown', replaced: false, downgrade: false, issues: verified.issues }
    }
    const name = manifest.name
    const existing = ledger.plugins[name]
    const version = manifest.version ?? '0.0.0'
    const target = join(storeDir, `${name}@${version}`)
    const downgrade = existing !== undefined && compareVersions(version, existing.version) < 0

    // Replace: remove the old directory (if any), move the staged one in.
    if (existing !== undefined) {
      await rm(join(storeDir, `${name}@${existing.version}`), { recursive: true, force: true })
    }
    await rm(target, { recursive: true, force: true })
    await rename(staged, target)

    await mkdir(join(dataRoot, name), { recursive: true })
    const checksum = await checksumDir(target)
    const row: LedgerPlugin = {
      name,
      version,
      source: { ...source, checksum },
      installedAt: new Date().toISOString(),
      // Replacing preserves the previous enable states (all levels).
      enabled: existing?.enabled ?? true,
      skills: existing?.skills ?? {},
      mcp: existing?.mcp ?? {},
    }
    ledger.plugins[name] = row
    await saveLedger(storeDir, ledger)
    return { name, version, replaced: existing !== undefined, downgrade, issues: verified.issues }
  } finally {
    await cleanup()
  }
}

/** Uninstall: remove files + ledger row; PLUGIN_DATA is kept and reported. */
export async function uninstallPlugin(
  storeDir: string,
  dataRoot: string,
  ledger: Ledger,
  name: string,
): Promise<{ ok: boolean; dataDir: string; issue?: ManifestIssue }> {
  const row = ledger.plugins[name]
  if (row === undefined) {
    return { ok: false, dataDir: join(dataRoot, name), issue: { path: name, message: `plugin "${name}" is not installed` } }
  }
  await rm(join(storeDir, `${name}@${row.version}`), { recursive: true, force: true })
  delete ledger.plugins[name]
  await saveLedger(storeDir, ledger)
  const dataDir = join(dataRoot, name)
  return { ok: true, dataDir }
}

/** Update by ledger source: re-fetch, re-verify, swap; old version stays on failure. */
export async function updatePlugin(
  storeDir: string,
  dataRoot: string,
  ledger: Ledger,
  name: string,
): Promise<InstallResult & { found: boolean }> {
  const row = ledger.plugins[name]
  if (row === undefined) {
    return { name, version: 'unknown', replaced: false, downgrade: false, found: false, issues: [{ path: name, message: `plugin "${name}" is not installed` }] }
  }
  const result = await installFromSource(row.source, { storeDir, dataRoot }, ledger)
  return { ...result, found: true }
}

// ---------------------------------------------------------------------------
// Enable / disable (plugin-level and component-level)
// ---------------------------------------------------------------------------

export async function setPluginEnabled(storeDir: string, ledger: Ledger, name: string, enabled: boolean): Promise<{ ok: boolean; issue?: ManifestIssue }> {
  const row = ledger.plugins[name]
  if (row === undefined) return { ok: false, issue: { path: name, message: `plugin "${name}" is not installed` } }
  row.enabled = enabled
  await saveLedger(storeDir, ledger)
  return { ok: true }
}

export async function setSkillEnabled(storeDir: string, ledger: Ledger, name: string, skillName: string, enabled: boolean): Promise<{ ok: boolean; issue?: ManifestIssue }> {
  const row = ledger.plugins[name]
  if (row === undefined) return { ok: false, issue: { path: name, message: `plugin "${name}" is not installed` } }
  row.skills[skillName] = { enabled }
  await saveLedger(storeDir, ledger)
  return { ok: true }
}

export async function setMcpEnabled(storeDir: string, ledger: Ledger, name: string, serverName: string, enabled: boolean): Promise<{ ok: boolean; issue?: ManifestIssue }> {
  const row = ledger.plugins[name]
  if (row === undefined) return { ok: false, issue: { path: name, message: `plugin "${name}" is not installed` } }
  row.mcp[serverName] = { enabled }
  await saveLedger(storeDir, ledger)
  return { ok: true }
}

/** Component effective state: plugin-level AND component-level (both default true). */
export function componentEnabled(row: LedgerPlugin, kind: 'skills' | 'mcp', key: string): boolean {
  if (!row.enabled) return false
  const state = row[kind][key]
  return state?.enabled ?? true
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Loose semver comparison (numeric segments); for downgrade warnings only. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((s) => parseInt(s, 10)).map((n) => (Number.isNaN(n) ? 0 : n))
  const pb = b.split('.').map((s) => parseInt(s, 10)).map((n) => (Number.isNaN(n) ? 0 : n))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
