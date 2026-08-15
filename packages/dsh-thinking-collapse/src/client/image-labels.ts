import type { MessageImageLabels } from '@deepseek-ai/dsh-client-ui-attachment'
import type { ChatViewSlotProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Preserve the upstream conversation strings for historical message images. */
export function messageImageLabels(t: ChatViewSlotProps['t']): MessageImageLabels {
  return {
    image: t('image.label'),
    open: t('image.openOriginal'),
    openNamed: label => t('image.openOriginalLabel', { label }),
    loading: t('image.loading'),
    loadFailed: t('image.loadFailed'),
    lightbox: {
      dialog: t('image.preview'),
      close: t('image.closePreview'),
    },
  }
}
