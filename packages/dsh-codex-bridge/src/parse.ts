import { createHash } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { parseDocument } from 'yaml'
import { contained, HomeReadError } from './reader.js'
import type { RecordValue } from './types.js'

export function record(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}
export function text(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined }
export function digest(value: string): string { return createHash('sha256').update(value).digest('hex') }

/** Parse TOML without returning parser excerpts in diagnostics. */
export function toml(value: string): RecordValue { return record(parseToml(value)) }

/** Parse YAML as plain values with alias expansion disabled. */
export function yaml(value: string): RecordValue {
  const document = parseDocument(value, { uniqueKeys: true })
  if (document.errors.length) throw new Error('Invalid YAML')
  return record(document.toJS({ maxAliasCount: 0 }))
}

/** Stable mapping from original identities to the DSH kebab-case grammar.
 * @param original Canonical namespaced skill identity.
 * @param namespace Marketplace or Home namespace.
 * @returns Stable name, including a collision-resistant identity suffix.
 */
export function skillName(original: string, namespace: string): string {
  const readable = original.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 80).replace(/-$/u, '') || 'skill'
  return `codex-${readable}-${digest(`${namespace}\0${original}`).slice(0, 12)}`
}

/** Resolve manifest paths relative to a plugin root, not the manifest directory.
 * @param root Absolute plugin root.
 * @param value Explicit relative manifest path.
 * @returns Lexically contained path; the reader additionally validates realpath.
 */
export function componentPath(root: string, value: string): string {
  if (!value.startsWith('./') || isAbsolute(value)) throw new HomeReadError('INVALID_COMPONENT_PATH', root)
  const target = resolve(root, value)
  if (!contained(root, target)) throw new HomeReadError('OUTSIDE_PLUGIN', root)
  return target
}

export interface ParsedSkill { metadata: RecordValue; content: string; name: string; description: string }
/** Parse one skill's required frontmatter and Markdown body. */
export function parseSkill(value: string): ParsedSkill {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/u.exec(value.replace(/^\uFEFF/u, ''))
  if (!match) throw new Error('Missing skill frontmatter')
  const metadata = yaml(match[1]!)
  const name = text(metadata.name)?.trim()
  const description = text(metadata.description)?.trim()
  if (!name || !description) throw new Error('Missing skill identity')
  return { metadata, content: match[2]!, name, description }
}

/** Portable root metadata and OpenAI-specific overlay. No merge between overlays.
 * @param portable Root plugin.json when present.
 * @param compatibility .codex-plugin/plugin.json when present.
 * @returns Canonical identity/portable components with the selected OpenAI overlay.
 */
export function pluginManifest(portable: RecordValue | undefined, compatibility: RecordValue | undefined): RecordValue {
  if (!portable) return compatibility ?? {}
  const extension = record(record(portable.extensions)['com.openai'])
  const hasExtension = Object.keys(extension).length > 0 || (record(portable.extensions)['com.openai'] !== null && typeof record(portable.extensions)['com.openai'] === 'object' && !Array.isArray(record(portable.extensions)['com.openai']))
  const overlay = hasExtension ? extension : compatibility ?? {}
  // Identity and portable components in the root are canonical.
  const result = { ...overlay, ...portable }
  delete result.extensions
  return result
}

/** Translate only explicit namespaced skill-call tokens, leaving other prose intact.
 * @param content Original instruction content.
 * @param aliases Unambiguous original-to-DSH skill mappings.
 * @returns In-memory adapted content.
 */
export function translateSkillCalls(content: string, aliases: ReadonlyMap<string, string>): string {
  return content.replace(/\$([a-zA-Z0-9][a-zA-Z0-9_-]*:[a-zA-Z0-9][a-zA-Z0-9_-]*)/gu, (token, identity: string) => {
    const target = aliases.get(identity)
    return target ? `$${target}` : token
  })
}

/** Import only credential-free configuration; authentication belongs to DSH. */
export function mcpBlockedReason(config: RecordValue): string | undefined {
  const secrets = /(?:token|secret|password|authorization|api[-_]?key|cookie|credential)/iu
  // Opaque header/env names may still carry secrets. Do not classify by name,
  // resolve ambient values, or drop these fields and connect anonymously.
  if (Object.keys(config).some(key => ['headers', 'http_headers', 'env', 'env_vars', 'env_http_headers'].includes(key) || /(?:http_headers_helper|credential|oauth|bearer_token)/iu.test(key))) return 'Credential configuration requires independent DSH MCP configuration; Codex credentials are not imported.'
  if (typeof config.url === 'string') {
    try {
      const url = new URL(config.url)
      if (url.username || url.password || [...url.searchParams.keys()].some(key => secrets.test(key))) return 'Credential-bearing URLs are not imported.'
      if (!['http:', 'https:'].includes(url.protocol)) return 'Unsupported MCP URL scheme.'
    } catch { return 'Invalid MCP URL.' }
  }
  if (config.command && config.url) return 'MCP specifies conflicting transports.'
  if (!config.command && !config.url) return 'MCP requires a command or URL.'
  return undefined
}
