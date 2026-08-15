/**
 * Home-patch synchronization for generated MCP server rows.
 *
 * The adapter writes `dsh-mcp-client` insert rows into a MANAGED SECTION of
 * the home user patch layer (`$DSH_HOME/cordis.patch.yml`), which the
 * launcher watches through HMR (`watchUserPatches` → `entry.update`), so the
 * rows activate without a restart.
 *
 * Hard requirements (verified against rc.6 behaviour):
 * - the whole file must always parse as a single top-level YAML array; a
 *   broken file makes the NEXT BOOT fail loud, so writes are atomic
 *   (tmp + rename) and the managed section only ever appends/removes its own
 *   rows, never touching user entries;
 * - row ids are stable (`ap-mcp-<plugin>-<server>`) so hot reloads keep the
 *   same tool names;
 * - on sync failure the caller decides whether to warn "restart required"
 *   (the rc.6 fallback).
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { mcpRowId, type McpClientConfig } from './mcp-map.js'

/** Marker lines delimiting the managed section inside the patch file. */
export const MANAGED_SECTION_START = '# === agent-plugins generated (managed) ==='
export const MANAGED_SECTION_END = '# === end agent-plugins generated ==='

/** One generated patch entry for a dsh-mcp-client row. */
export interface McpPatchEntry {
  id: string
  name: string
  config: McpClientConfig
}

/** Row name under which dsh-mcp-client is resolvable in the profile. */
export const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client'

/** Build the patch entry for one mapped server. */
export function mcpPatchEntry(pluginName: string, serverName: string, config: McpClientConfig): McpPatchEntry {
  return {
    id: mcpRowId(pluginName, serverName),
    name: MCP_CLIENT_PACKAGE,
    config: { ...config, serverName: config.serverName },
  }
}

/**
 * Serialize the managed section as YAML-ish text (the loader accepts plain
 * YAML; our rows contain only strings/objects, so JSON-compatible YAML is
 * safe and keeps quoting deterministic).
 */
export function serializeManagedSection(entries: McpPatchEntry[]): string {
  const body = entries.map((entry) => {
    // The config block must indent DEEPER than the `config:` key (6 spaces):
    // JSON.stringify's 4-space lines get an 8-space prefix so the whole block
    // stays a valid YAML mapping value (a wrong indent here breaks the file
    // and the next boot fails loud).
    const config = JSON.stringify(entry.config, null, 4).split('\n').map((line) => `        ${line}`).join('\n')
    return [
      `    - id: ${entry.id}`,
      `      name: '${entry.name}'`,
      `      config:`,
      config,
    ].join('\n')
  }).join('\n')
  if (entries.length === 0) {
    return `${MANAGED_SECTION_START}\n[]\n${MANAGED_SECTION_END}\n`
  }
  return `${MANAGED_SECTION_START}\n- insert:\n${body}\n${MANAGED_SECTION_END}\n`
}

/**
 * Read a patch file and return (a) everything before the managed section,
 * (b) the managed section, (c) everything after it. Missing file → empty
 * parts. An unparseable file is the caller's problem (doctor checks it).
 */
export function splitManagedSection(text: string): { head: string; managed: string; tail: string } {
  const start = text.indexOf(MANAGED_SECTION_START)
  if (start === -1) return { head: text, managed: '', tail: '' }
  const afterStart = start + MANAGED_SECTION_START.length
  const end = text.indexOf(MANAGED_SECTION_END, afterStart)
  if (end === -1) {
    // Damaged marker: keep everything before the start marker, drop the rest.
    return { head: text.slice(0, start), managed: '', tail: '' }
  }
  // The newline right after the END marker belongs to the managed block, so
  // round-trips stay byte-identical (idempotent syncs).
  let afterEnd = end + MANAGED_SECTION_END.length
  if (text[afterEnd] === '\n') afterEnd++
  return { head: text.slice(0, start), managed: text.slice(afterStart, end), tail: text.slice(afterEnd) }
}

/**
 * Apply a desired set of MCP rows to the home patch file (atomic write).
 * User entries outside the managed section are preserved verbatim.
 * @param file - the managed patch file (e.g. $DSH_HOME/cordis.patch.yml).
 * @param entries - full desired set of generated rows (sync replaces the section).
 * @returns whether the file changed.
 */
export async function syncPatchFile(file: string, entries: McpPatchEntry[]): Promise<{ changed: boolean; error?: string }> {
  let text = ''
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return { changed: false, error: `unreadable patch file: ${String(error)}` }
    }
  }
  const { head, tail } = splitManagedSection(text)
  const desired = serializeManagedSection(entries)
  const next = `${head}${desired}${tail}`
  if (next === text) return { changed: false }
  try {
    await mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
    await writeFile(tmp, next, 'utf8')
    await rename(tmp, file)
    return { changed: true }
  } catch (error) {
    return { changed: false, error: `failed to write patch file: ${String(error)}` }
  }
}

/** Compute the desired entries from a set of enabled servers. */
export function entriesForServers(
  servers: Array<{ pluginName: string; serverName: string; config: McpClientConfig }>,
): McpPatchEntry[] {
  return servers.map(({ pluginName, serverName, config }) => mcpPatchEntry(pluginName, serverName, config))
}

/** Extract the current generated entry ids from a patch file (doctor support). */
export function managedEntryIds(file: string): Promise<string[]> {
  return readFile(file, 'utf8').then((text) => {
    const { managed } = splitManagedSection(text)
    const ids: string[] = []
    for (const line of managed.split('\n')) {
      const match = /^\s*- id: (\S+)$/.exec(line)
      if (match !== null) ids.push(match[1] ?? '')
    }
    return ids.filter((id) => id.startsWith('ap-mcp-'))
  }).catch(() => [])
}
