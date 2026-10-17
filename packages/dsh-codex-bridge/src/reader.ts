import { constants } from 'node:fs'
import { open, realpath, opendir } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import type { BridgeOptions, Diagnostic } from './types.js'

export class HomeReadError extends Error {
  constructor(readonly code: string, readonly source: string) {
    super(`${code}: ${source}`)
  }
}

/** Compare canonical paths; lexical prefixes alone do not establish containment.
 * @param root Canonical directory.
 * @param path Canonical target.
 * @returns Whether target is inside root (or equal).
 */
export function contained(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
}

const denied = /^(?:auth(?:\..*)?|\.credentials(?:\..*)?|credentials(?:\..*)?|\.env(?:\..*)?|\.codex-global-state(?:\..*)?|.*\.sqlite(?:-.*)?|.*\.db|history\.jsonl|session_index\.jsonl)$/iu

/** Allowlisted read-only Home access. No writes, subprocesses or credential probing. */
export class HomeReader {
  private entriesSeen = 0
  private charge(path: string): void {
    this.signal?.throwIfAborted()
    if (++this.entriesSeen > this.options.maxEntries) throw new HomeReadError('ENTRY_LIMIT', path)
  }
  private canonicalHome?: string
  constructor(readonly options: BridgeOptions, readonly diagnostics: Diagnostic[], readonly signal?: AbortSignal) {}

  /** Canonicalize a target within Home and optionally a tighter plugin boundary.
   * @param path Absolute or Home-relative target.
   * @param boundary Additional required root.
   * @returns Validated canonical path.
   */
  async resolve(path: string, boundary?: string): Promise<string> {
    this.signal?.throwIfAborted()
    this.canonicalHome ??= await realpath(this.options.home)
    const lexical = resolve(this.options.home, path)
    if ((!contained(resolve(this.options.home), lexical) && !contained(this.canonicalHome, lexical)) || denied.test(basename(lexical))) throw new HomeReadError('FORBIDDEN_PATH', lexical)
    const canonical = await realpath(lexical)
    if (!contained(this.canonicalHome, canonical) || denied.test(basename(canonical))) throw new HomeReadError('OUTSIDE_HOME', lexical)
    if (boundary && !contained(await realpath(boundary), canonical)) throw new HomeReadError('OUTSIDE_PLUGIN', lexical)
    return canonical
  }

  /** Read bounded UTF-8 text. Missing optional files return undefined.
   * @param path Allowlisted metadata/instruction path.
   * @param boundary Optional plugin root.
   * @returns Text or undefined for ENOENT.
   */
  async text(path: string, boundary?: string): Promise<string | undefined> {
    this.signal?.throwIfAborted()
    this.charge(path)
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      const canonical = await this.resolve(path, boundary)
      handle = await open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      const info = await handle.stat()
      if (!info.isFile()) throw new HomeReadError('NOT_REGULAR_FILE', path)
      if (info.size > this.options.maxFileBytes) throw new HomeReadError('FILE_TOO_LARGE', path)
      const bytes = Buffer.alloc(this.options.maxFileBytes + 1)
      let length = 0
      while (length < bytes.length) {
        this.signal?.throwIfAborted()
        const result = await handle.read(bytes, length, bytes.length - length, null)
        if (!result.bytesRead) break
        length += result.bytesRead
      }
      if (length > this.options.maxFileBytes) throw new HomeReadError('FILE_TOO_LARGE', path)
      this.signal?.throwIfAborted()
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length))
    } catch (error) {
      this.signal?.throwIfAborted()
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    } finally { await handle?.close() }
  }

  /** List a bounded directory without traversing arbitrary files.
   * @param path Home-relative or absolute directory.
   * @param boundary Optional plugin boundary.
   * @returns Sorted directory entries.
   */
  async entries(path: string, boundary?: string) {
    try {
      this.charge(path)
      const canonical = await this.resolve(path, boundary)
      const items: import('node:fs').Dirent[] = []
      // Streaming enumeration avoids allocating an unbounded directory before enforcing the budget.
      for await (const item of await opendir(canonical)) {
        this.charge(path)
        items.push(item)
      }
      this.signal?.throwIfAborted()
      return items.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    } catch (error) {
      this.signal?.throwIfAborted()
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  /** Add sanitized diagnostics, never parser exceptions containing file content.
   * @param source Source path.
   * @param error Failure.
   */
  report(source: string, error: unknown): void {
    this.signal?.throwIfAborted()
    const code = error instanceof HomeReadError ? error.code : 'INVALID_SOURCE'
    this.diagnostics.push({ severity: 'error', code, source, message: `Cannot read or parse source (${code}).` })
  }
}
