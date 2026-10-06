/**
 * Whole-interface zoom row registered into the General section's item slot.
 *
 * The row edits the durable preference the browser half applies, so the
 * displayed value always follows the persisted setting rather than the click
 * echo. Styling stays inline on `--dsw-*` tokens: the row renders inside the
 * host's settings list, and a v1 plugin carries no stylesheet of its own.
 */
import type { CSSProperties } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { ZOOM_PERCENT_MAX, ZOOM_PERCENT_MIN, ZOOM_PERCENT_STEP } from '../settings.js'
import type { createUiZoomRowStore } from './settings-store.js'

/** Injected business face: the preference write (`t` rides the standard locale seat). */
export interface UiZoomRowInjected {
  /** Set the whole-interface zoom in percent; the plugin clamps out-of-range values. */
  setZoomPercent: (percent: number) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type UiZoomRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createUiZoomRowStore>>
  & PropsLocale<'ui-zoom'> & UiZoomRowInjected

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '8px 0',
}

const text: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }

const title: CSSProperties = { color: 'var(--dsw-alias-label-primary)', fontSize: '14px' }

const description: CSSProperties = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' }

const control: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }

const button: CSSProperties = {
  minWidth: '24px',
  height: '24px',
  padding: '0 6px',
  cursor: 'pointer',
  borderRadius: '6px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
  lineHeight: 1,
}

const value: CSSProperties = {
  minWidth: '44px',
  textAlign: 'center',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
  fontVariantNumeric: 'tabular-nums',
}

/**
 * Render the whole-interface zoom row.
 * @param props - Composed slot props.
 * @returns The row element tree.
 */
export function UiZoomRow({ t, setZoomPercent, useStore }: UiZoomRowComponentProps) {
  const zoomPercent = useStore(state => state.zoomPercent)
  return (
    <div style={row}>
      <div style={text}>
        <div style={title}>{t('zoom.title')}</div>
        <div style={description}>{t('zoom.description')}</div>
      </div>
      <div style={control}>
        <button
          type="button"
          style={button}
          aria-label={t('zoom.decrease')}
          disabled={zoomPercent <= ZOOM_PERCENT_MIN}
          onClick={() => { setZoomPercent(zoomPercent - ZOOM_PERCENT_STEP) }}
        >
          −
        </button>
        <span style={value}>{`${zoomPercent}${t('zoom.unit')}`}</span>
        <button
          type="button"
          style={button}
          aria-label={t('zoom.increase')}
          disabled={zoomPercent >= ZOOM_PERCENT_MAX}
          onClick={() => { setZoomPercent(zoomPercent + ZOOM_PERCENT_STEP) }}
        >
          +
        </button>
        <button
          type="button"
          style={button}
          onClick={() => { setZoomPercent(100) }}
        >
          {t('zoom.reset')}
        </button>
      </div>
    </div>
  )
}
