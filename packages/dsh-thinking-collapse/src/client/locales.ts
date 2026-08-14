import type {} from '@deepseek-ai/dsh-client-ui-slots'

export const THINKING_COLLAPSE_NS = 'thinking-collapse' as const

export const zh = {
  'status.running': '思考中',
  'status.history': '思考过程',
  'status.elapsed': '耗时 {duration}',
  'duration.seconds': '{seconds}秒',
  'duration.minutes': '{minutes}分钟 {seconds}秒',
} as const

export type ThinkingCollapseLocaleKey = keyof typeof zh

export const en: Record<ThinkingCollapseLocaleKey, string> = {
  'status.running': 'Thinking',
  'status.history': 'Thoughts',
  'status.elapsed': 'Worked for {duration}',
  'duration.seconds': '{seconds}s',
  'duration.minutes': '{minutes}m {seconds}s',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Codex-style reasoning status and elapsed-time copy. */
    'thinking-collapse': ThinkingCollapseLocaleKey
  }
}
