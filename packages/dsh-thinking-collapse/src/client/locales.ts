import type {} from '@deepseek-ai/dsh-client-ui-slots'

export const THINKING_COLLAPSE_NS = 'thinking-collapse' as const

export const zh = {
  'status.history': '思考过程',
  'status.elapsed': '耗时 {duration}',
  'status.processed': '已处理 {duration}',
  'duration.seconds': '{seconds}秒',
  'duration.minutes': '{minutes}分钟 {seconds}秒',
  'duration.compactSeconds': '{seconds}s',
  'duration.compactMinutes': '{minutes}m {seconds}s',
} as const

export type ThinkingCollapseLocaleKey = keyof typeof zh

export const en: Record<ThinkingCollapseLocaleKey, string> = {
  'status.history': 'Thoughts',
  'status.elapsed': 'Worked for {duration}',
  'status.processed': 'Worked for {duration}',
  'duration.seconds': '{seconds}s',
  'duration.minutes': '{minutes}m {seconds}s',
  'duration.compactSeconds': '{seconds}s',
  'duration.compactMinutes': '{minutes}m {seconds}s',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Codex-style reasoning status and elapsed-time copy. */
    'thinking-collapse': ThinkingCollapseLocaleKey
  }
}
