/** Reproduce late Host invalidations while real settings writes remain queued. */
import { useSyncExternalStore } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UiZoomRow, type UiZoomRowComponentProps } from '../src/client/UiZoomRow.js'
import { createSettingsRuntime } from './settings-runtime.js'

type Runtime = Awaited<ReturnType<typeof createSettingsRuntime>>
const runtimes: Runtime[] = []
afterEach(async () => {
  cleanup()
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
  document.head.replaceChildren()
  document.documentElement.style.removeProperty('zoom')
})

async function mount() {
  const runtime = await createSettingsRuntime()
  runtimes.push(runtime)
  const useStore: UiZoomRowComponentProps['useStore'] = (selector) => useSyncExternalStore(
    runtime.instance.subscribe, () => selector(runtime.instance.getSnapshot()),
  )
  render(<UiZoomRow {...{
    ...runtime.injected, useStore,
    t: (key: string) => key === 'zoom.unit' ? '%' : key,
  } as UiZoomRowComponentProps} />)
  return runtime
}

async function increase(times: number) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => { fireEvent.click(screen.getByLabelText('zoom.increase')) })
  }
}

async function settle(runtime: Runtime) {
  while (runtime.pending() > 0) await act(async () => { await runtime.accept() })
}

describe('zoom intent versus published target settings invalidations', () => {
  it('keeps ten clicks when older Host describes arrive between later local intents', async () => {
    const runtime = await mount()
    await increase(3)
    await act(async () => { await runtime.notify(105) })
    await increase(3)
    await act(async () => { await runtime.notify(110) })
    await increase(4)
    expect(screen.getByText('150%')).toBeDefined()
    expect(document.documentElement.style.zoom).toBe('1.5')
    await settle(runtime)
    expect(runtime.requested).toEqual([105, 110, 115, 120, 125, 130, 135, 140, 145, 150])
    expect(screen.getByText('150%')).toBeDefined()
    expect(document.documentElement.style.zoom).toBe('1.5')
  })

  it('restores the Host value and reports a refused latest write', async () => {
    const runtime = await mount()
    await increase(1)
    await act(async () => { await runtime.refuse() })
    expect(screen.getByText('100%')).toBeDefined()
    expect(document.documentElement.style.zoom).toBe('1')
    expect(screen.getByRole('alert').textContent).toBe('zoom.saveFailed')
  })

  it('does not leave a disconnected write looking saved or reject without an observer', async () => {
    const runtime = await mount()
    await increase(1)
    await act(async () => { await runtime.disconnect() })
    expect(screen.getByText('100%')).toBeDefined()
    expect(document.documentElement.style.zoom).toBe('1')
    expect(screen.getByRole('alert').textContent).toBe('zoom.saveFailed')
  })

  it('does not let a superseded refusal erase a newer accepted choice', async () => {
    const runtime = await mount()
    await increase(2)
    await act(async () => { await runtime.refuse() })
    expect(screen.getByText('110%')).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
    await settle(runtime)
    expect(screen.getByText('110%')).toBeDefined()
    expect(document.documentElement.style.zoom).toBe('1.1')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rolls a refused latest choice back to the intermediate Host-confirmed value', async () => {
    const runtime = await mount()
    await increase(2)
    await act(async () => { await runtime.accept(); await runtime.notify(105) })
    expect(screen.getByText('110%')).toBeDefined()
    await act(async () => { await runtime.refuse() })
    expect(screen.getByText('105%')).toBeDefined()
    expect(document.documentElement.style.zoom).toBe('1.05')
    expect(screen.getByRole('alert')).toBeDefined()
  })

  it('does not revive document styles when a pending write settles after unload', async () => {
    const runtime = await mount()
    await increase(1)
    await act(async () => { await runtime.unload() })
    expect(document.documentElement.style.zoom).toBe('')
    await act(async () => { await runtime.accept(); await runtime.notify(175) })
    expect(document.documentElement.style.zoom).toBe('')
    expect(document.querySelector('style[data-dsh-ui-zoom]')).toBeNull()
  })

  it('adopts external settings changes again once the latest local write settles', async () => {
    const runtime = await mount()
    await increase(2)
    await settle(runtime)
    await act(async () => { await runtime.notify(175) })
    expect(screen.getByText('175%')).toBeDefined()
    expect(document.documentElement.style.zoom).toBe('1.75')
  })
})
