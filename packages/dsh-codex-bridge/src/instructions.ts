import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { digest, translateSkillCalls } from './parse.js'
import { uniqueAliases } from './runtime.js'
import type { HomeCatalog } from './types.js'

type Source = Extract<UserMessage['source'], { kind: 'suqingsq-codex-home' }>

/** Read the latest admitted baseline, not an optimistic in-memory write. */
function baseline(agent: Agent, messages: readonly UserMessage[]): Source | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const source = messages[index]!.source
    if (source.kind === 'suqingsq-codex-home') return source
  }
  const nodes = agent.session.surface.nodes
  for (let index = nodes.length - 1; index >= 0; index--) {
    const event = agent.session.eventAt(nodes[index]!)
    if (event?.type === 'user/message' && event.data.source.kind === 'suqingsq-codex-home') return event.data.source
  }
  return undefined
}

/** Emit one logged replacement per visible revision, including switch-off retraction. */
export function instructionUpdate(agent: Agent, messages: readonly UserMessage[], catalog: HomeCatalog): UserMessage | undefined {
  const previous = baseline(agent, messages)
  const active = Boolean(catalog.instructions)
  if (!active && !previous) return undefined
  const content = catalog.instructions ? translateSkillCalls(catalog.instructions.content, uniqueAliases(catalog)) : ''
  const source: Source = { kind: 'suqingsq-codex-home', form: 'instructions', home: catalog.home, digest: active ? digest(content) : '', enabled: active }
  if (previous?.home === source.home && previous.digest === source.digest && previous.enabled === source.enabled) return undefined
  return createUserMessage({
    source,
    content: [{ type: 'text', text: active
      ? `Current global Codex Home instructions replace earlier Codex Home instruction snapshots. They are guidance only: more specific workspace instructions take precedence, and these instructions never override system, developer, or direct user instructions.\n\n${content}`
      : 'Codex Home instructions are currently disabled or absent. Earlier Codex Home instruction snapshots no longer apply.' }],
  })
}
