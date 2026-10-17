export type RecordValue = Record<string, unknown>

/** Whole-category user preferences. No per-skill or per-plugin overrides. */
export interface BridgeOptions {
  home: string
  enabled: boolean
  instructions: boolean
  skills: boolean
  plugins: boolean
  agents: boolean
  connectMcp: boolean
  executeHooks: boolean
  maxFileBytes: number
  maxEntries: number
  maxDepth: number
}

export interface Diagnostic {
  severity: 'warning' | 'error'
  code: string
  source: string
  message: string
}

export interface HomeInstructions {
  path: string
  content: string
  digest: string
}

export interface HomeSkill {
  id: string
  name: string
  originalName: string
  description: string
  path: string
  resourceDirectory: string
  pluginId?: string
  modelInvocable: boolean
  userInvocable: boolean
  dependencies: readonly RecordValue[]
  metadata: RecordValue
}

export interface HomePlugin {
  id: string
  name: string
  marketplace: string
  root: string
  version: string
  enabled: boolean | 'unknown'
  status: 'enabled' | 'disabled' | 'unknown' | 'ambiguous' | 'invalid'
  manifest: RecordValue
  skills: HomeSkill[]
  mcp: HomeMcp[]
  hooks: HomeHook[]
}

export interface HomeAgent {
  name: string
  description: string
  path: string
  developerInstructions: string
  config: RecordValue
}

export interface HomeMcp {
  id: string
  name: string
  source: string
  root: string
  pluginId?: string
  config: RecordValue
  enabled: boolean
  blockedReason?: string
}

export interface HomeHook {
  event: string
  matcher?: string
  source: string
  root: string
  pluginId?: string
  handler: RecordValue
}

/** In-process catalog: contains instruction/config content; never serialize wholesale to UI. */
export interface HomeCatalog {
  home: string
  scannedAt: string
  instructions?: HomeInstructions
  skills: HomeSkill[]
  plugins: HomePlugin[]
  agents: HomeAgent[]
  mcp: HomeMcp[]
  hooks: HomeHook[]
  diagnostics: Diagnostic[]
}

/** Safe public projection, excluding config, instruction bodies, env, headers and commands. */
export interface CatalogView {
  home: string
  scannedAt: string
  instructions?: { path: string; digest: string }
  skills: { name: string; originalName: string; path: string; modelInvocable: boolean; pluginId?: string }[]
  plugins: { id: string; version: string; status: HomePlugin['status']; root: string; skills: number; mcp: number; hooks: number }[]
  agents: { name: string; path: string }[]
  mcp: { id: string; enabled: boolean; blockedReason?: string }[]
  hooks: { event: string; source: string }[]
  diagnostics: Diagnostic[]
}

/** Project a catalog without leaking execution configuration or prompt content.
 * @param catalog Private catalog.
 * @returns Safe UI/diagnostic view.
 */
export function catalogView(catalog: HomeCatalog): CatalogView {
  return {
    home: catalog.home,
    scannedAt: catalog.scannedAt,
    ...(catalog.instructions ? { instructions: { path: catalog.instructions.path, digest: catalog.instructions.digest } } : {}),
    skills: catalog.skills.map(({ name, originalName, path, modelInvocable, pluginId }) => ({ name, originalName, path, modelInvocable, ...(pluginId ? { pluginId } : {}) })),
    plugins: catalog.plugins.map(p => ({ id: p.id, version: p.version, status: p.status, root: p.root, skills: p.skills.length, mcp: p.mcp.length, hooks: p.hooks.length })),
    agents: catalog.agents.map(({ name, path }) => ({ name, path })),
    mcp: catalog.mcp.map(({ id, enabled, blockedReason }) => ({ id, enabled, ...(blockedReason ? { blockedReason } : {}) })),
    hooks: catalog.hooks.map(({ event, source }) => ({ event, source })),
    diagnostics: catalog.diagnostics,
  }
}
