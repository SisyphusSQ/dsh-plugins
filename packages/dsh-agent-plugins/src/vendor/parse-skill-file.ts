/**
 * SKILL.md frontmatter parsing — vendored from @deepseek-ai/dsh-skill-filesystem
 * (lib/index.js `parseSkillFile` + helpers, 0.1.0-rc.6), because the original
 * is module-private and not exported. Behavior is kept equivalent:
 *
 * - first line must be exactly `---`; the block closes at the next `---` line
 * - body YAML must parse to a plain object (invalid YAML → skipped)
 * - `name` and `description` are required non-empty strings; name must be
 *   kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
 * - optional: `whenToUse` (string), `metadata` (object), `user-invocable`
 *   and `disable-model-invocation` (booleans; legacy keys modelInvocable /
 *   userInvocable / disableModelInvocation are REJECTED)
 * - unknown fields are ignored
 *
 * Upstream PR to export the original is the preferred fix; this file exists
 * so the adapter does not block on it.
 */
import { parse } from 'yaml'

/** Parsed SKILL.md projection (equivalent of the upstream parseSkillFile return). */
export interface ParsedSkillFile {
  name: string
  description: string
  whenToUse?: string
  invocation: { modelInvocable: boolean; userInvocable: boolean }
  metadata?: Readonly<Record<string, unknown>>
  content: string
}

/** Skill name constraint shared with dsh-skill (local copy of its SKILL_NAME). */
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isSkillName(name: string): boolean {
  return SKILL_NAME_RE.test(name)
}

/**
 * Parse a SKILL.md document.
 * @param raw - full SKILL.md text.
 * @returns the parsed projection, or `undefined` when the file must be skipped
 * (missing/invalid frontmatter, missing fields, invalid name/invocation).
 */
export function parseSkillFile(raw: string): ParsedSkillFile | undefined {
  const parsed = parseFrontmatter(raw)
  if (parsed === undefined) return undefined
  const name = stringField(parsed.data, 'name')
  const description = stringField(parsed.data, 'description')
  if (name === undefined || description === undefined) return undefined
  if (!isSkillName(name)) return undefined
  let invocation: { modelInvocable: boolean; userInvocable: boolean }
  try {
    invocation = parseInvocationPolicy(parsed.data)
  } catch {
    return undefined
  }
  const whenToUse = optionalString(parsed.data, 'whenToUse')
  return {
    name,
    description,
    ...(whenToUse !== undefined ? { whenToUse } : {}),
    invocation,
    ...optionalMetadata(parsed.data),
    content: parsed.body.trim(),
  }
}

interface Frontmatter {
  data: Record<string, unknown>
  body: string
}

function parseFrontmatter(raw: string): Frontmatter | undefined {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) return undefined
  if (raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return undefined
  const start = firstLineEnd + 1
  const closing = findClosingFrontmatter(raw, start)
  if (closing === undefined) return undefined
  const parsed = parse(raw.slice(start, closing.start))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  return { data: parsed as Record<string, unknown>, body: raw.slice(closing.bodyStart) }
}

function findClosingFrontmatter(raw: string, start: number): { start: number; bodyStart: number } | undefined {
  let lineStart = start
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      return { start: lineStart, bodyStart: nextNewline < 0 ? raw.length : nextNewline + 1 }
    }
    if (nextNewline < 0) return undefined
    lineStart = nextNewline + 1
  }
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseInvocationPolicy(data: Record<string, unknown>): { modelInvocable: boolean; userInvocable: boolean } {
  rejectLegacyInvocationKey(data, 'disableModelInvocation', 'disable-model-invocation')
  rejectLegacyInvocationKey(data, 'modelInvocable', 'disable-model-invocation')
  rejectLegacyInvocationKey(data, 'userInvocable', 'user-invocable')
  const disableModelInvocation = frontmatterBoolean(data, 'disable-model-invocation')
  const userInvocable = frontmatterBoolean(data, 'user-invocable')
  return {
    modelInvocable: disableModelInvocation !== true,
    userInvocable: userInvocable !== false,
  }
}

function rejectLegacyInvocationKey(data: Record<string, unknown>, legacy: string, canonical: string): void {
  if (Object.hasOwn(data, legacy)) throw new Error(`frontmatter field "${legacy}" is unsupported; use "${canonical}"`)
}

function frontmatterBoolean(data: Record<string, unknown>, key: string): boolean | undefined {
  if (!Object.hasOwn(data, key)) return undefined
  const value = data[key]
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string') {
    switch (value.toLowerCase()) {
      case 'true':
      case 'yes':
      case 'on': return true
      case 'false':
      case 'no':
      case 'off': return false
    }
  }
  throw new TypeError(`frontmatter field "${key}" must be a boolean`)
}

function optionalMetadata(data: Record<string, unknown>): { metadata: Readonly<Record<string, unknown>> } | Record<string, never> {
  const value = data.metadata
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return { metadata: value as Readonly<Record<string, unknown>> }
  }
  return {}
}
