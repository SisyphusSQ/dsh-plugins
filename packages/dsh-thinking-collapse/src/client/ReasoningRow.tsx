import { useEffect, useState } from 'react'
import type { MarkdownCodeLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  DisclosureRow,
  IconChevronRightOutline14,
  MarkdownText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { THINKING_COLLAPSE_NS } from './locales.js'
import type { ReasoningBlockTiming } from './timing.js'
import a11yCss from './accessibility.module.css'
import css from './ReasoningRow.module.css'

export function formatThinkingDuration(
  ms: number,
  t: TranslateNS<typeof THINKING_COLLAPSE_NS>,
): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return t('duration.seconds', { seconds })
  const minutes = Math.floor(seconds / 60)
  return t('duration.minutes', { minutes, seconds: seconds % 60 })
}

export function formatCompactThinkingDuration(
  ms: number,
  t: TranslateNS<typeof THINKING_COLLAPSE_NS>,
): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return t('duration.compactSeconds', { seconds })
  const minutes = Math.floor(seconds / 60)
  return t('duration.compactMinutes', { minutes, seconds: seconds % 60 })
}

export interface ReasoningRowProps {
  readonly text: string
  /** The block is still the final streaming block and must stay expanded. */
  readonly live: boolean
  /** Reasoning tokens are still arriving; controls the running animation only. */
  readonly active: boolean
  readonly timing?: ReasoningBlockTiming | undefined
  readonly t: ChatViewSlotProps['t']
  readonly thinkingT: TranslateNS<typeof THINKING_COLLAPSE_NS>
  readonly codeLabels: MarkdownCodeLabels
}

/** Live reasoning is forced open; settled reasoning becomes a content-free summary. */
export function ReasoningRow({
  text,
  live,
  active,
  timing,
  t,
  thinkingT,
  codeLabels,
}: ReasoningRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (live) setExpanded(false)
  }, [live])

  useEffect(() => {
    if (!active || timing === undefined || timing.endedAt !== null) return undefined
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active, timing])

  const end = timing?.endedAt ?? (active ? now : undefined)
  const durationMs = timing !== undefined && end !== undefined
    ? end - timing.startedAt
    : undefined
  const duration = durationMs !== undefined
    ? formatThinkingDuration(durationMs, thinkingT)
    : undefined
  const compactDuration = durationMs !== undefined
    ? formatCompactThinkingDuration(durationMs, thinkingT)
    : undefined
  const open = live || expanded
  const title = active
    ? thinkingT('status.processed', {
        duration: compactDuration ?? thinkingT('duration.compactSeconds', { seconds: 0 }),
      })
    : duration === undefined
      ? thinkingT('status.history')
      : thinkingT('status.elapsed', { duration })

  return (
    <div className={css.root} data-variant="think" data-state={active ? 'running' : 'ok'}>
      {active && <span className={a11yCss.visuallyHidden}>{t('row.running')}</span>}
      <div className={css.header}>
        <DisclosureRow
          rowClassName={css.row}
          leadingClassName={css.leading}
          titleClassName={css.title}
          chevronClassName={css.chevron}
          icon={<IconChevronRightOutline14 size={14} />}
          title={title}
          open={open}
          expandable
          expandOnRowClick={!live}
          previewChevron={false}
          onToggle={() => {
            if (!live) setExpanded(value => !value)
          }}
        />
      </div>
      {open && (
        <div className={css.thinkBody}>
          <MarkdownText text={text} streaming={active} codeLabels={codeLabels} />
        </div>
      )}
    </div>
  )
}
