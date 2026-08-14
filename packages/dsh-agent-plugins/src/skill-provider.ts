/**
 * agent-plugins skills provider: registers every `skills/<name>/SKILL.md`
 * from the configured stores as a `ctx.skills` provider candidate.
 *
 * Discovery rules:
 * - one candidate per direct child of `skills/` containing a SKILL.md (no recursion)
 * - candidate name/description come from the SKILL.md frontmatter (vendored
 *   parser, see vendor/parse-skill-file.ts); invalid files are skipped
 * - component-level enable state (`installed.json` `skills.<name>.enabled`,
 *   AND plugin-level `enabled`) filters candidates at `list()` time
 * - duplicate skill names within this provider: first store order wins, later
 *   ones are skipped with a warning (registry-level rank/order still applies)
 * - rank 90: explicitly installed third-party skills beat the generic custom
 *   layer (100) and lose to project/user layers (60/40)
 */
import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {
  SkillCandidate,
  SkillDefinition,
  SkillLookupOptions,
  SkillProvider,
  SkillProviderControl,
} from '@deepseek-ai/dsh-skill'
import { parseSkillFile } from './vendor/parse-skill-file.js'
import { scanStore, type Ledger, type StorePlugin } from './store.js'

/** Explicitly installed third-party skills: between project (60/70) and custom (100). */
export const AGENT_PLUGINS_SKILL_RANK = 90
/** Skill source label (SkillSource is an open string union). */
export const AGENT_PLUGINS_SOURCE = 'agent-plugins'

export interface SkillProviderOptions {
  /** Machine-level store directories to scan (default: $DSH_HOME/agent-plugins). */
  stores: string[]
  /** Read the current ledger (called on every list(); cheap). */
  readLedger: () => Ledger
  /** Logging callback for skips and conflicts. */
  warn: (message: string) => void
}

/** Opaque locator passed back to get() by the registry. */
interface SkillLocator {
  path: string
  directory: string
}

/** Skill candidate discovery across stores with component-level filtering. */
export class AgentPluginsSkillProvider implements SkillProvider {
  readonly name = 'agent-plugins'

  constructor(
    private readonly ctx: Context,
    private readonly opts: SkillProviderOptions,
  ) {}

  /**
   * Discover candidates. Project-level stores are resolved per lookup:
   * `cwd/.agent-plugins` and the project root's `.agent-plugins` (found by
   * walking up to a `.git` marker) contribute skills only.
   */
  async list(options: SkillLookupOptions): Promise<SkillCandidate[]> {
    const ledger = this.opts.readLedger()
    const candidates: SkillCandidate[] = []
    const seen = new Set<string>()
    const pluginDirs: { plugin: StorePlugin; storeDir: string }[] = []

    for (const storeDir of this.opts.stores) {
      for (const plugin of await scanStore(storeDir)) {
        pluginDirs.push({ plugin, storeDir })
      }
    }
    for (const projectStore of await this.projectStores(options.cwd)) {
      for (const plugin of await scanStore(projectStore)) {
        pluginDirs.push({ plugin, storeDir: projectStore })
      }
    }

    for (const { plugin } of pluginDirs) {
      const row = ledger.plugins[plugin.name]
      // Plugin-level disable removes every skill candidate.
      if (row !== undefined && !row.enabled) continue
      for (const skillName of plugin.skills) {
        // Component-level enable state (absent = enabled).
        const component = row?.skills[skillName]
        if (component !== undefined && !component.enabled) continue

        const directory = join(plugin.dir, 'skills', skillName)
        const path = join(directory, 'SKILL.md')
        const parsed = await this.readCandidate(path)
        if (parsed === undefined) continue

        if (seen.has(parsed.name)) {
          this.opts.warn(`skill "${parsed.name}" from ${path} conflicts with an earlier store entry; skipped`)
          continue
        }
        seen.add(parsed.name)
        const locator: SkillLocator = { path, directory }
        candidates.push({
          name: parsed.name,
          description: parsed.description,
          ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
          invocation: parsed.invocation,
          provider: this.name,
          source: AGENT_PLUGINS_SOURCE,
          rank: AGENT_PLUGINS_SKILL_RANK,
          locator,
          resourceBase: { kind: 'directory', path: directory },
          path,
          ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
        })
      }
    }
    return candidates
  }

  /** Load the full skill body for a winning candidate. */
  async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    const locator = candidate.locator as SkillLocator
    const parsed = await this.readCandidate(locator.path, options.signal)
    if (parsed === undefined) return undefined
    return {
      name: parsed.name,
      description: parsed.description,
      ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
      invocation: parsed.invocation,
      source: AGENT_PLUGINS_SOURCE,
      provider: this.name,
      resourceBase: { kind: 'directory', path: locator.directory },
      path: locator.path,
      ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
      content: parsed.content,
    }
  }

  /** No-op placeholder kept for symmetry; invalidation is adapter-driven. */
  attach(_control: SkillProviderControl): void {
    // The adapter calls control.invalidate() from its fs watcher.
  }

  /** Project-level stores for one cwd (skills only, per the 2026-08-14 decision). */
  private async projectStores(cwd: string | undefined): Promise<string[]> {
    if (cwd === undefined) return []
    const stores = new Set<string>([join(cwd, '.agent-plugins'), join(await this.findProjectRoot(cwd), '.agent-plugins')])
    return [...stores]
  }

  private async findProjectRoot(cwd: string): Promise<string> {
    let current = cwd
    for (;;) {
      try {
        await access(join(current, '.git'))
        return current
      } catch {
        const parent = dirname(current)
        if (parent === current) return cwd
        current = parent
      }
    }
  }

  private async readCandidate(path: string, signal?: AbortSignal): Promise<ReturnType<typeof parseSkillFile>> {
    signal?.throwIfAborted()
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
    signal?.throwIfAborted()
    const parsed = parseSkillFile(raw)
    if (parsed === undefined) {
      this.opts.warn(`skill file ${path} ignored: invalid or missing frontmatter (name+description required)`)
    }
    return parsed
  }
}
