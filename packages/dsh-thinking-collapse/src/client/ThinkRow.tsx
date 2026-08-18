import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  DisclosureRow,
  IconThinkOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import a11yCss from './accessibility.module.css'
import css from './ThinkRow.module.css'

const DEFAULT_INTERVAL_FRAMES = 3

function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

function latestLine(text: string): string {
  const visible = text.trimEnd()
  const newline = visible.lastIndexOf('\n')
  return newline === -1 ? visible : visible.slice(newline + 1)
}

function useThrottledVisualUpdate(update: () => void, intervalFrames = DEFAULT_INTERVAL_FRAMES): () => void {
  const updateRef = useRef(update)
  updateRef.current = update
  const pendingFrameRef = useRef<number | null>(null)
  useLayoutEffect(() => () => {
    if (pendingFrameRef.current === null) return
    cancelAnimationFrame(pendingFrameRef.current)
    pendingFrameRef.current = null
  }, [])
  return useCallback(() => {
    if (pendingFrameRef.current !== null) return
    let remainingFrames = intervalFrames
    const advance = (): void => {
      remainingFrames -= 1
      if (remainingFrames > 0) {
        pendingFrameRef.current = requestAnimationFrame(advance)
        return
      }
      pendingFrameRef.current = null
      updateRef.current()
    }
    pendingFrameRef.current = requestAnimationFrame(advance)
  }, [intervalFrames])
}

export interface ThinkRowProps {
  readonly text: string
  readonly running: boolean
  readonly t: ChatViewSlotProps['t']
}

/** Upstream DSH Think disclosure: icon, first/latest-line preview, independent expand. */
export function ThinkRow({ text, running, t }: ThinkRowProps) {
  const [expanded, setExpanded] = useState(false)
  const summaryRef = useRef<HTMLSpanElement>(null)
  const summary = running ? latestLine(text) : firstLine(text)
  const scheduleSummaryScroll = useThrottledVisualUpdate(() => {
    const element = summaryRef.current
    if (element === null) return
    element.scrollLeft = running ? element.scrollWidth - element.clientWidth : 0
  })
  useEffect(() => {
    scheduleSummaryScroll()
  }, [running, scheduleSummaryScroll, summary])

  return (
    <div
      className={css.root}
      data-variant="think"
      data-activity="thought"
      data-state={running ? 'running' : 'ok'}
    >
      {running && <span className={a11yCss.visuallyHidden}>{t('row.running')}</span>}
      <DisclosureRow
        rowClassName={css.row}
        leadingClassName={css.leading}
        titleClassName={css.title}
        chevronClassName={css.chevron}
        icon={<IconThinkOutline14 size={14} />}
        title="Think"
        open={expanded}
        expandable
        expandOnRowClick
        onToggle={() => {
          setExpanded(value => !value)
        }}
        collapsedContent={(
          <>
            <span className={css.separator} aria-hidden />
            <span
              ref={summaryRef}
              className={css.summary}
              data-follow-end={running || undefined}
            >
              {summary}
            </span>
          </>
        )}
      >
        <div className={css.thinkBody}>{text}</div>
      </DisclosureRow>
    </div>
  )
}
