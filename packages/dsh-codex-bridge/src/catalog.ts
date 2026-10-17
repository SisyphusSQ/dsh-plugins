import { dirname, join, resolve } from 'node:path'
import { HomeReader } from './reader.js'
import { compileMcp } from './mcp.js'
import { componentPath, digest, mcpBlockedReason, parseSkill, pluginManifest, record, skillName, text, toml, yaml } from './parse.js'
import type { BridgeOptions, HomeAgent, HomeCatalog, HomeHook, HomeMcp, HomePlugin, HomeSkill, RecordValue } from './types.js'
export { catalogView } from './types.js'
export type * from './types.js'

async function parsed(reader: HomeReader, path: string, format: 'json' | 'toml' | 'yaml', boundary?: string): Promise<RecordValue | undefined> {
  const value = await reader.text(path, boundary)
  if (value === undefined) return undefined
  return format === 'json' ? record(JSON.parse(value)) : format === 'toml' ? toml(value) : yaml(value)
}

/** Scan only Home-owned metadata, never credentials or workspace files.
 * @param options Validated whole-category options.
 * @param signal Optional cancellation.
 * @returns Private catalog; use catalogView before crossing a UI boundary.
 */
export async function scanHome(options: BridgeOptions, signal?: AbortSignal): Promise<HomeCatalog> {
  const result: HomeCatalog = { home: resolve(options.home), scannedAt: new Date().toISOString(), skills: [], plugins: [], agents: [], mcp: [], hooks: [], diagnostics: [] }
  if (!options.enabled || ![options.instructions, options.skills, options.plugins, options.agents, options.connectMcp, options.executeHooks].some(Boolean)) return result
  const reader = new HomeReader({ ...options, home: result.home }, result.diagnostics, signal)
  let config: RecordValue = {}
  try { config = await parsed(reader, 'config.toml', 'toml') ?? {} } catch (error) { reader.report('config.toml', error) }

  if (options.instructions) {
    try {
      for (const candidate of ['AGENTS.override.md', 'AGENTS.md']) {
        const content = await reader.text(candidate)
        if (!content?.trim()) continue
        const configuredLimit = config.project_doc_max_bytes
        const limit = typeof configuredLimit === 'number' && Number.isSafeInteger(configuredLimit) && configuredLimit >= 0 ? configuredLimit : 32768
        // Drop an incomplete UTF-8 tail rather than exposing replacement characters.
        const bytes = Buffer.from(content).subarray(0, limit)
        let end = bytes.length
        let bounded = ''
        for (let i = 0; i < 4; i++) {
          try { bounded = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, end)); break } catch { end-- }
        }
        result.instructions = { path: join(result.home, candidate), content: bounded, digest: digest(bounded) }
        if (Buffer.byteLength(content) > limit) result.diagnostics.push({ severity: 'warning', code: 'INSTRUCTIONS_TRUNCATED', source: result.instructions.path, message: 'Instructions reached the configured Codex byte limit.' })
        break
      }
    } catch (error) { reader.report('AGENTS.md', error) }
  }
  if (options.skills) {
    try { result.skills.push(...await scanSkills(reader, join(result.home, 'skills'), config)) } catch (error) { reader.report('skills', error) }
  }
  if (options.agents) result.agents.push(...await scanAgents(reader, config))
  if (options.plugins) {
    const cache = join(result.home, 'plugins/cache')
    try {
      for (const market of await reader.entries(cache)) {
        if (!market.isDirectory() && !market.isSymbolicLink()) continue
        for (const entry of await reader.entries(join(cache, market.name))) {
          if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
          const id = `${entry.name}@${market.name}`
          const state = record(record(config.plugins)[id])
          const dirs = (await reader.entries(join(cache, market.name, entry.name))).filter(d => d.isDirectory() || d.isSymbolicLink())
          // A marketplace revision identifies its index, not every plugin's installed revision.
          const requested = text(state.version) ?? text(state.local_version)
          const selected = requested ? dirs.filter(d => d.name === requested || (requested.length >= 8 && d.name === requested.slice(0, 8))) : dirs
          const enabled = state.enabled === true ? true : state.enabled === false ? false : 'unknown'
          if (selected.length !== 1) {
            result.plugins.push({ id, name: entry.name, marketplace: market.name, root: join(cache, market.name, entry.name), version: '', enabled, status: 'ambiguous', manifest: {}, skills: [], mcp: [], hooks: [] })
            result.diagnostics.push({ severity: 'warning', code: 'AMBIGUOUS_PLUGIN_VERSION', source: id, message: 'No unambiguous installed version; no component was adopted.' })
            continue
          }
          const root = join(cache, market.name, entry.name, selected[0]!.name)
          const plugin: HomePlugin = { id, name: entry.name, marketplace: market.name, root, version: selected[0]!.name, enabled, status: enabled === true ? 'enabled' : enabled === false ? 'disabled' : 'unknown', manifest: {}, skills: [], mcp: [], hooks: [] }
          result.plugins.push(plugin)
          try {
            const portable = await parsed(reader, join(root, 'plugin.json'), 'json', root)
            const compatibility = await parsed(reader, join(root, '.codex-plugin/plugin.json'), 'json', root)
            if (!portable && !compatibility) throw new Error('Missing plugin manifest')
            plugin.manifest = pluginManifest(portable, compatibility)
            if (text(plugin.manifest.name) !== entry.name) throw new Error('Plugin identity mismatch')
            // Listing disabled/unknown plugins must not read their executable components.
            if (enabled !== true) {
              if (enabled === 'unknown') result.diagnostics.push({ severity: 'warning', code: 'PLUGIN_ENABLEMENT_UNKNOWN', source: id, message: 'Cache presence does not establish effective enablement in Home config.' })
              continue
            }
            const skills = plugin.manifest.skills
            const roots = skills === undefined ? ['./skills'] : typeof skills === 'string' ? [skills] : Array.isArray(skills) && skills.every(s => typeof s === 'string') ? skills as string[] : undefined
            if (!roots) throw new Error('Invalid skills component')
            for (const path of roots) plugin.skills.push(...await scanSkills(reader, componentPath(root, path), config, plugin))
            plugin.mcp.push(...await scanPluginMcp(reader, plugin, state))
            plugin.hooks.push(...await scanPluginHooks(reader, plugin))
            result.skills.push(...plugin.skills)
            result.mcp.push(...plugin.mcp)
            result.hooks.push(...plugin.hooks)
            if (plugin.manifest.apps !== undefined) result.diagnostics.push({ severity: 'warning', code: 'PLUGIN_APPS_REQUIRE_RUNTIME', source: id, message: 'App connectors require independent DSH integration; no Codex login state is imported.' })
          } catch (error) { plugin.status = 'invalid'; reader.report(root, error) }
        }
      }
    } catch (error) { reader.report(cache, error) }
  }
  // Home-scoped MCP/hooks are separate from plugin-owned components.
  if (options.connectMcp) {
    result.mcp.push(...mcpRows(record(config.mcp_servers), 'config.toml', result.home))
  }
  if (options.executeHooks) {
    try {
      const hooks = await parsed(reader, 'hooks.json', 'json')
      if (hooks) result.hooks.push(...hookRows(hooks, join(result.home, 'hooks.json'), result.home))
      const inline = record(config.hooks)
      if (Object.keys(inline).some(key => key !== 'state')) result.hooks.push(...hookRows(inline, 'config.toml', result.home))
    } catch (error) { reader.report('hooks.json', error) }
  }
  // Original names may occur in different marketplaces. Do not silently choose an alias.
  const aliases = new Map<string, number>()
  for (const skill of result.skills) aliases.set(skill.originalName, (aliases.get(skill.originalName) ?? 0) + 1)
  for (const [name, count] of aliases) if (count > 1) result.diagnostics.push({ severity: 'warning', code: 'AMBIGUOUS_SKILL_ALIAS', source: name, message: 'Original identity exists in multiple sources; use its mapped DSH name.' })
  return result
}

async function scanSkills(reader: HomeReader, root: string, config: RecordValue, plugin?: HomePlugin): Promise<HomeSkill[]> {
  const skills: HomeSkill[] = []
  const visited = new Set<string>()
  const selectors = Array.isArray(record(config.skills).config) ? record(config.skills).config as unknown[] : []
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > reader.options.maxDepth) throw new Error('Skill depth limit')
    try {
      const canonical = await reader.resolve(directory, plugin?.root)
      if (visited.has(canonical)) return
      visited.add(canonical)
      const path = join(canonical, 'SKILL.md')
      const content = await reader.text(path, plugin?.root)
      if (content !== undefined) {
        const parsedSkill = parseSkill(content)
        const originalName = plugin ? `${plugin.name}:${parsedSkill.name}` : parsedSkill.name
        if (selectors.some(s => {
          const row = record(s)
          return row.enabled === false && (row.name === originalName || (typeof row.path === 'string' && resolve(reader.options.home, row.path) === path))
        })) return
        const metadataPath = join(canonical, 'agents/openai.yaml')
        const ui = await parsed(reader, metadataPath, 'yaml', plugin?.root) ?? {}
        const metadata = { ...parsedSkill.metadata, codex: ui }
        const dependencies = Array.isArray(record(ui.dependencies).tools) ? (record(ui.dependencies).tools as unknown[]).map(record) : []
        skills.push({ id: `${plugin?.id ?? 'home'}:${originalName}`, name: skillName(originalName, plugin?.marketplace ?? 'home'), originalName, description: parsedSkill.description, path, resourceDirectory: canonical, ...(plugin ? { pluginId: plugin.id } : {}), modelInvocable: record(ui.policy).allow_implicit_invocation !== false && parsedSkill.metadata['disable-model-invocation'] !== true, userInvocable: parsedSkill.metadata['user-invocable'] !== false, dependencies, metadata })
        return // references/scripts are resources, not recursive discovery roots.
      }
      for (const entry of await reader.entries(canonical, plugin?.root)) {
        if ((entry.isDirectory() || entry.isSymbolicLink()) && !['.git', 'node_modules', 'references', 'scripts', 'assets'].includes(entry.name)) await visit(join(canonical, entry.name), depth + 1)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') reader.report(directory, error)
    }
  }
  await visit(root, 0)
  return skills
}

async function scanAgents(reader: HomeReader, config: RecordValue): Promise<HomeAgent[]> {
  if (record(config.agents).enabled === false) return []
  const paths: { path: string; name?: string; description?: string }[] = []
  const agents: HomeAgent[] = []
  try {
    for (const [name, value] of Object.entries(record(config.agents))) {
      const role = record(value), file = text(role.config_file)
      if (file) paths.push({ path: resolve(reader.options.home, file), name, ...(text(role.description) ? { description: text(role.description)! } : {}) })
    }
    const referenced = new Set(paths.map(row => row.path))
    for (const entry of await reader.entries('agents')) {
      const path = join(reader.options.home, 'agents', entry.name)
      if (entry.name.endsWith('.toml') && (entry.isFile() || entry.isSymbolicLink()) && !referenced.has(path)) paths.push({ path })
    }
    for (const definition of paths) {
      const { path } = definition;
      try {
        const row = await parsed(reader, path, 'toml')
        if (!row) throw new Error('Missing referenced agent')
        const name = (definition.name ?? text(row.name))?.trim(), description = (definition.description ?? text(row.description))?.trim(), instructions = text(row.developer_instructions)
        if (!name || !description || !instructions?.trim()) throw new Error('Invalid agent definition')
        if (agents.some(agent => agent.name === name)) throw new Error('Duplicate agent name')
        // Keep only runtime-relevant fields. Do not expose arbitrary config secrets.
        const projected: RecordValue = {}
        for (const key of ['model', 'model_reasoning_effort', 'sandbox_mode', 'skills', 'mcp_servers', 'approval_policy']) if (row[key] !== undefined) projected[key] = row[key]
        const known = new Set(['name', 'description', 'developer_instructions', 'model', 'model_reasoning_effort', 'sandbox_mode', 'skills', 'mcp_servers', 'approval_policy'])
        // Preserve the existence, never the content, of unknown runtime requirements.
        if (Object.keys(row).some(key => !known.has(key))) projected.unsupported_configuration = true
        agents.push({ name, description, path, developerInstructions: instructions, config: projected })
      } catch (error) { reader.report(path, error) }
    }
  } catch (error) { reader.report('agents', error) }
  return agents
}

function mcpRows(servers: RecordValue, source: string, root: string, plugin?: HomePlugin, state: RecordValue = {}): HomeMcp[] {
  return Object.entries(servers).map(([name, value]) => {
    const config = { ...record(value), ...record(record(state.mcp_servers)[name]) }
    const row: HomeMcp = { id: `${plugin?.id ?? 'home'}:${name}`, name, source, root, ...(plugin ? { pluginId: plugin.id } : {}), config, enabled: config.enabled !== false }
    // Shape validation only: catalog discovery must not resolve ambient secrets.
    try { compileMcp(row) }
    catch { row.blockedReason = mcpBlockedReason(config) ?? 'Unsupported or conflicting MCP configuration; configure this server independently in DSH.' }
    return row
  })
}

async function scanPluginMcp(reader: HomeReader, plugin: HomePlugin, state: RecordValue): Promise<HomeMcp[]> {
  const raw = plugin.manifest.mcpServers ?? plugin.manifest.mcp_servers ?? plugin.manifest.mcp
  const values = raw === undefined ? ['./mcp.json', './.mcp.json'] : Array.isArray(raw) ? raw : [raw]
  const rows: HomeMcp[] = []
  for (const value of values) {
    const source = typeof value === 'string' ? componentPath(plugin.root, value) : plugin.root
    const document = typeof value === 'string' ? await parsed(reader, source, 'json', plugin.root) : record(value)
    if (!document) { if (raw !== undefined) throw new Error('Missing referenced MCP file'); continue }
    const servers = document.mcpServers ?? document.mcp_servers ?? document
    rows.push(...mcpRows(record(servers), source, plugin.root, plugin, state))
    if (raw === undefined) break // portable default wins over compatibility fallback.
  }
  return rows
}

function hookRows(document: RecordValue, source: string, root: string, plugin?: HomePlugin): HomeHook[] {
  const events = record(document.hooks ?? document)
  const result: HomeHook[] = []
  for (const [event, raw] of Object.entries(events)) {
    if (event === 'state') continue
    if (!Array.isArray(raw)) throw new Error('Invalid hook event')
    for (const group of raw) {
      const row = record(group)
      if (!Array.isArray(row.hooks)) throw new Error('Invalid hook group')
      for (const value of row.hooks) result.push({ event, ...(typeof row.matcher === 'string' ? { matcher: row.matcher } : {}), source, root, ...(plugin ? { pluginId: plugin.id } : {}), handler: record(value) })
    }
  }
  return result
}

async function scanPluginHooks(reader: HomeReader, plugin: HomePlugin): Promise<HomeHook[]> {
  const raw = plugin.manifest.hooks
  const sources = raw === undefined ? ['./hooks/hooks.json'] : Array.isArray(raw) ? raw : [raw]
  const rows: HomeHook[] = []
  for (const value of sources) {
    const source = typeof value === 'string' ? componentPath(plugin.root, value) : plugin.root
    const document = typeof value === 'string' ? await parsed(reader, source, 'json', plugin.root) : record(value)
    if (!document) { if (raw !== undefined) throw new Error('Missing referenced hooks'); continue }
    rows.push(...hookRows(document, source, plugin.root, plugin))
  }
  return rows
}
