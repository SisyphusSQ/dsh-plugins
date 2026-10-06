import { createElement, useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { standardHookPropName } from '@deepseek-ai/dsh-client-ui-slots'
import type { HostObservable, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ToolCallHookContext, ToolCallInjected, ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'

export type ToolViewSlots = Pick<SlotRegistry, 'entriesOfSlot' | 'subscribe' | 'getVersion' | 'spec'>

/**
 * Standard kit the official atomic Tool views expect. A `conversation.chat.node`
 * entry receives the Chat standard kit, which covers every Session-scoped member
 * these views read; `t` is bound separately because the Tool views own the
 * `conversation` namespace while Chat nodes own `chat`.
 */
export interface AtomicToolViewKit {
  /** `conversation` namespace copy owned by the official Tool views. */
  readonly t: TranslateNS<'conversation'>
  /** `chat` namespace copy for this plugin's own fallback envelope. */
  readonly fallbackT: TranslateNS<'chat'>
  readonly sessionId: ChatNodeViewProps['sessionId']
  readonly useSession: ChatNodeViewProps['useSession']
  readonly useProjection: ChatNodeViewProps['useProjection']
  readonly useSessions: ChatNodeViewProps['useSessions']
  readonly useDisclosure: ChatNodeViewProps['useDisclosure']
  readonly loadImage: ChatNodeViewProps['loadImage']
}

export function atomicKitFromChatNode(
  props: ChatNodeViewProps,
  t: TranslateNS<'conversation'>,
): AtomicToolViewKit {
  return {
    t,
    fallbackT: props.t,
    sessionId: props.sessionId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    useSessions: props.useSessions,
    useDisclosure: props.useDisclosure,
    loadImage: props.loadImage,
  }
}

export function UnknownToolFallback({
  toolName,
  block,
  t,
}: {
  readonly toolName: string
  readonly block: ToolCallBlock
  readonly t: TranslateNS<'chat'>
}): ReactNode {
  const payload = 'kind' in block
    ? {
        name: toolName,
        args: block.call?.argsRaw ?? null,
        isError: block.isError,
        content: block.content,
      }
    : {
        name: toolName,
        args: block.phase === 'start' ? block.argsRaw : null,
      }
  return (
    <JsonBlock
      label={toolName === '' ? t('message.unknownBlock') : toolName}
      payload={payload}
      truncatedLabel={total => t('json.truncated', { total })}
    />
  )
}

/**
 * Wrap one observable source as the `use<Name>` selector Hook the slot
 * renderer synthesizes from an entry's inject face.
 */
function selectorHook<Snapshot>(source: HostObservable<Snapshot>) {
  return function useSelector<Selected>(
    selector?: (snapshot: Snapshot) => Selected,
    equal?: (left: Selected, right: Selected) => boolean,
  ): Snapshot | Selected {
    const cache = useRef<{ snapshot: Snapshot; value: unknown } | undefined>(undefined)
    const getSnapshot = useCallback((): Snapshot | Selected => {
      const snapshot = source.getSnapshot()
      if (selector === undefined) return snapshot
      const previous = cache.current
      if (previous !== undefined && Object.is(previous.snapshot, snapshot)) {
        return previous.value as Snapshot | Selected
      }
      const value = selector(snapshot)
      const selected: Snapshot | Selected = previous !== undefined
        && equal !== undefined
        && equal(previous.value as Selected, value)
        ? previous.value as Snapshot | Selected
        : value
      cache.current = { snapshot, value: selected }
      return selected
    }, [selector, equal])
    const subscribe = useCallback(
      (listener: () => void) => source.subscribe(listener),
      [source],
    )
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  }
}

function isHostObservable(value: unknown): value is HostObservable<unknown> {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as { getSnapshot?: unknown; subscribe?: unknown }
  return typeof candidate.getSnapshot === 'function' && typeof candidate.subscribe === 'function'
}

/** Expand one inject `hooks` compartment into its component-side Hook props. */
function bindHookSources(
  hooks: Readonly<Record<string, unknown>>,
  kit: AtomicToolViewKit,
  hookContext: ToolCallHookContext | undefined,
): Record<string, unknown> {
  const bound: Record<string, unknown> = {}
  for (const [name, source] of Object.entries(hooks)) {
    bound[standardHookPropName(name)] = isHostObservable(source)
      ? selectorHook(source)
      : (source as (standard: object, context: unknown) => unknown)(kit, hookContext)
  }
  return bound
}

/**
 * Resolve one inject face as the component-side wiring does: every member passes
 * through verbatim except `hooks`, whose sources become the `use<Name>` props the
 * component declares.
 */
function bindInjectedFace(
  face: object | undefined,
  kit: AtomicToolViewKit,
  hookContext: ToolCallHookContext | undefined,
): Record<string, unknown> {
  if (face === undefined) return {}
  const { hooks, ...rest } = face as { hooks?: Readonly<Record<string, unknown>> }
  return hooks === undefined
    ? { ...rest }
    : { ...rest, ...bindHookSources(hooks, kit, hookContext) }
}

/**
 * Reproduce the composed props the slot renderer supplies to one dispatched
 * entry: the slot-level inject face declared with `tool.call.toolview`, plus the
 * registrant's own business face. Hand dispatch skips the render machinery, so
 * both faces are bound here from their declared sources.
 */
function bindEntryFace(
  entry: StoredEntry,
  kit: AtomicToolViewKit,
  slotInject: ToolCallInjected | undefined,
  hookContext: ToolCallHookContext | undefined,
): Record<string, unknown> {
  const inject = entry.inject as ((...args: unknown[]) => Record<string, unknown>) | undefined
  return {
    ...bindInjectedFace(slotInject, kit, hookContext),
    ...bindInjectedFace(inject?.(kit.sessionId), kit, hookContext),
  }
}

/**
 * Dispatch an already-declared `tool.call.toolview` entry without re-declaring
 * that child slot. Official ui-tool owns the declaration; duplicate children
 * fail loader apply. A 0.2 entry also carries inject faces the render machinery
 * would bind (a preparing call's argument prefix, the todo history), so this
 * path binds them from the same declared sources before rendering.
 */
export function AtomicToolView({
  owner,
  kit,
  slots,
  hookContext,
}: {
  readonly owner: ToolCallOwnerProps
  readonly kit: AtomicToolViewKit
  readonly slots: ToolViewSlots
  readonly hookContext?: ToolCallHookContext | undefined
}): ReactNode {
  const getVersion = (): number => slots.getVersion('tool.call.toolview')
  useSyncExternalStore(
    onStoreChange => slots.subscribe('tool.call.toolview', onStoreChange),
    getVersion,
    getVersion,
  )
  const entry = slots.entriesOfSlot('tool.call.toolview').find(
    item => item.options.key === owner.toolName,
  )
  const slotInject = slots.spec('tool.call.toolview')?.inject
  const face = useMemo(
    () => entry === undefined ? {} : bindEntryFace(entry, kit, slotInject, hookContext),
    [entry, kit, slotInject, hookContext],
  )
  const Comp = entry?.component
  if (Comp == null) {
    return <UnknownToolFallback toolName={owner.toolName} block={owner.block} t={kit.fallbackT} />
  }
  return createElement(Comp as ComponentType<object>, { ...kit, ...face, ...owner })
}
