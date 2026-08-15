import { memo, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { AssistantBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { ImageLoader } from '@deepseek-ai/dsh-client-ui-attachment'
import { ImageGallery } from '@deepseek-ai/dsh-client-ui-attachment'
import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives'
import { JsonBlock, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { messageImageLabels } from './image-labels.js'
import type { THINKING_COLLAPSE_NS } from './locales.js'
import { ReasoningRow } from './ReasoningRow.js'
import type { ThinkingTimingData } from './timing.js'
import css from './AssistantMarkdown.module.css'

export interface AssistantMarkdownProps {
  readonly blocks: readonly AssistantBlock[]
  readonly streaming: boolean
  readonly interrupted?: boolean | undefined
  readonly loadImage?: ImageLoader
  readonly mentions?: MarkdownFileMentions | undefined
  readonly thinkingTiming?: ThinkingTimingData | undefined
  readonly t: ChatViewSlotProps['t']
  readonly thinkingT: TranslateNS<typeof THINKING_COLLAPSE_NS>
}

/** Preserve rc.6 Assistant block behavior while replacing ReasoningRow. */
export const AssistantMarkdown = memo(function AssistantMarkdown({
  blocks,
  streaming,
  interrupted,
  loadImage,
  mentions,
  thinkingTiming,
  t,
  thinkingT,
}: AssistantMarkdownProps) {
  const imageLoader = loadImage ?? (() => Promise.reject(new Error(t('image.serviceUnavailable'))))
  const codeLabels = useMemo(() => ({
    copyLabel: t('copy'),
    copiedLabel: t('copied'),
  }), [t])
  const last = blocks.length - 1
  const hasVisible = streaming
    || interrupted === true
    || blocks.some(block => block.kind !== 'tool-call')
  if (!hasVisible) return null

  const rendered: ReactNode[] = []
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]
    if (block === undefined) continue
    switch (block.kind) {
      case 'text':
        rendered.push(
          <MarkdownText
            key={i}
            text={block.text}
            streaming={streaming}
            codeLabels={codeLabels}
            fileMentions={mentions}
          />,
        )
        break
      case 'reasoning': {
        const live = streaming && i === last
        const timing = thinkingTiming?.blocks[i]
        rendered.push(
          <ReasoningRow
            key={i}
            text={block.text}
            live={live}
            active={live && (timing === undefined || timing.endedAt === null)}
            timing={timing}
            t={t}
            thinkingT={thinkingT}
            codeLabels={codeLabels}
          />,
        )
        break
      }
      case 'image': {
        const start = i
        const group = [block]
        while (i + 1 < blocks.length) {
          const next = blocks[i + 1]
          if (next === undefined || next.kind !== 'image') break
          group.push(next)
          i += 1
        }
        rendered.push(
          <ImageGallery
            key={start}
            images={group}
            load={imageLoader}
            align="start"
            labels={messageImageLabels(t)}
          />,
        )
        break
      }
      case 'tool-call':
        break
      default:
        rendered.push(
          <JsonBlock
            key={i}
            label={t('message.unknownBlock')}
            payload={block.block}
            truncatedLabel={total => t('json.truncated', { total })}
          />,
        )
    }
  }

  return (
    <div className={css.root} data-streaming={streaming || undefined}>
      <div className={css.body}>
        {rendered}
        {interrupted && <span className={css.stopped}>{t('message.stopped')}</span>}
      </div>
    </div>
  )
})
