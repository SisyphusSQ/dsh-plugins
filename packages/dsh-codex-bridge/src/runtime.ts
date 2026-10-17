import { scanHome } from './catalog.js'
import { digest, parseSkill, translateSkillCalls, yaml } from './parse.js'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { HomeReader } from './reader.js'
import type { BridgeOptions, HomeCatalog, HomeSkill } from './types.js'

/** One instance's lazy cache. Settings changes discard in-flight old observations. */
export class HomeRuntime {
  private cached?: { key: string; catalog: HomeCatalog; expires: number }
  private pending?: { key: string; promise: Promise<HomeCatalog> }
  private closed = false
  private readonly abort = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  private closing?: Promise<void>
  private own<T>(operation: Promise<T>): Promise<T> {
    const tracked = operation.finally(() => { this.operations.delete(tracked) })
    this.operations.add(tracked)
    return tracked
  }
  constructor(readonly options: () => BridgeOptions, readonly ttl = 5000) {}

  catalog(signal?: AbortSignal): Promise<HomeCatalog> {
    if (this.closed) return Promise.reject(new Error('Codex bridge is disposed'))
    return this.own(this.readCatalog(signal))
  }

  private async readCatalog(signal?: AbortSignal): Promise<HomeCatalog> {
    signal?.throwIfAborted()
    if (this.closed) throw new Error('Codex bridge is disposed')
    for (;;) {
      const key = JSON.stringify(this.options())
      const catalog = await this.observe(signal)
      signal?.throwIfAborted()
      if (this.closed) throw new Error('Codex bridge is disposed')
      if (JSON.stringify(this.options()) === key) return catalog
      // An old scan may complete after a category was disabled. Never publish it.
    }
  }

  private async observe(signal?: AbortSignal): Promise<HomeCatalog> {
    const options = this.options()
    const key = JSON.stringify(options)
    if (this.cached?.key === key && this.cached.expires > Date.now()) return this.cached.catalog
    if (this.pending?.key === key) return this.borrow(this.pending.promise, signal)
    const promise = this.own(scanHome(options, this.abort.signal).then(catalog => {
      if (!this.closed && JSON.stringify(this.options()) === key) this.cached = { key, catalog, expires: Date.now() + this.ttl }
      return catalog
    }).finally(() => { if (this.pending?.promise === promise) delete this.pending }))
    this.pending = { key, promise }
    return this.borrow(promise, signal)
  }

  private async borrow(promise: Promise<HomeCatalog>, signal?: AbortSignal): Promise<HomeCatalog> {
    if (!signal) return promise
    signal.throwIfAborted()
    let onAbort: () => void = () => {}
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason ?? new Error('Aborted'))
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try { return await Promise.race([promise, aborted]) } finally { signal.removeEventListener('abort', onAbort) }
  }

  /** Revalidate identity/containment at load time, not only at discovery. */
  body(skill: HomeSkill, signal?: AbortSignal): Promise<string | undefined> {
    if (this.closed) return Promise.reject(new Error('Codex bridge is disposed'))
    const ownedSignal = signal ? AbortSignal.any([signal, this.abort.signal]) : this.abort.signal
    return this.own(this.loadBody(skill, ownedSignal))
  }

  private async loadBody(skill: HomeSkill, signal: AbortSignal): Promise<string | undefined> {
    signal.throwIfAborted()
    const options = this.options()
    if (!options.enabled || !(skill.pluginId ? options.plugins : options.skills)) return undefined
    const catalog = await this.catalog(signal)
    const current = catalog.skills.find(row => row.id === skill.id && row.path === skill.path)
    if (!current) return undefined
    const plugin = current.pluginId ? catalog.plugins.find(row => row.id === current.pluginId) : undefined
    const reader = new HomeReader(options, [], signal)
    const raw = await reader.text(current.path, plugin?.root)
    if (!raw) return undefined
    const parsed = parseSkill(raw)
    const identity = plugin ? `${plugin.name}:${parsed.name}` : parsed.name
    if (identity !== current.originalName || parsed.description !== current.description) return undefined
    // A cached registry candidate must not bypass an edited invocation policy.
    // Re-read the optional policy/dependency file through the same bounded reader
    // and reject changed metadata until catalog discovery adopts the new revision.
    const uiText = await reader.text(join(current.resourceDirectory, 'agents/openai.yaml'), plugin?.root)
    const ui = uiText === undefined ? {} : yaml(uiText)
    if (!isDeepStrictEqual({ ...parsed.metadata, codex: ui }, current.metadata)) return undefined
    if (this.closed || JSON.stringify(this.options()) !== JSON.stringify(options)) return undefined
    const aliases = uniqueAliases(catalog)
    return translateSkillCalls(parsed.content, aliases)
  }

  /** Abort and drain every owned scan/read, including superseded observations. */
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    this.abort.abort(new Error('Codex bridge disposed'))
    delete this.cached
    return this.closing = (async () => {
      while (this.operations.size) await Promise.allSettled([...this.operations])
    })()
  }
}

/** Build only unambiguous aliases; duplicate names never pick an arbitrary winner. */
export function uniqueAliases(catalog: HomeCatalog): Map<string, string> {
  const counts = new Map<string, number>()
  for (const skill of catalog.skills) counts.set(skill.originalName, (counts.get(skill.originalName) ?? 0) + 1)
  return new Map(catalog.skills.filter(skill => counts.get(skill.originalName) === 1).map(skill => [skill.originalName, skill.name]))
}

/** Private change token: hashes execution content, never exposes it to callers. */
export function catalogFingerprint(catalog: HomeCatalog, options: BridgeOptions): string {
  return digest(JSON.stringify({
    options,
    instructions: catalog.instructions?.digest,
    skills: catalog.skills.map(s => [s.id, s.name, s.description, s.path, s.modelInvocable, s.userInvocable, s.dependencies, s.metadata]),
    plugins: catalog.plugins.map(p => [p.id, p.version, p.status, p.root]),
    agents: catalog.agents.map(a => [a.name, a.path, a.description, a.developerInstructions, a.config]),
    mcp: catalog.mcp.map(m => [m.id, m.root, m.pluginId, m.enabled, m.blockedReason, m.config]),
    hooks: catalog.hooks.map(h => [h.event, h.matcher, h.source, h.root, h.pluginId, h.handler]),
  }))
}
